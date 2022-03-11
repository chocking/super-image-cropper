import Cropper from 'cropperjs';
import { Decoder } from './lib/decoder';
import { SyntheticGIF } from './lib/synthetic-gif';
import { FrameCropper } from './lib/cropper';
import { ParsedFrame } from 'gifuct-js';
import { getImageInfo, loadImage, getImageType } from './lib/helper'

export interface CustomCropper extends Cropper {
  url: '';
  cropBoxData: Cropper.ImageData;
  canvasData: Cropper.ImageData;
  cropper?: HTMLDivElement
}

export interface ICropperOptions {
  cropperInstance?: CustomCropper;
  src?: string;
  cropperJsOpts?: ICropOpts;
  compress?: boolean;
}

export interface ICropOpts {
  width: number;
  height: number;
  scaleX?: number;
  scaleY?: number;
  x?: number;
  y?: number;
  background?: string;
  rotate?: number;
  left: number;
  top: number;
}

export interface IImageData {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface ICommonCropOptions {
  cropperJsOpts: Required<ICropOpts>;
  imageData: IImageData;
  cropBoxData: Cropper.CropBoxData
  withoutCropperJs: boolean;
}

export class SuperImageCropper {
  private cropperInstance?: CustomCropper;
  private imageInstance?: HTMLImageElement;
  private preImageSrc = '';
  private frames: ParsedFrame[] = [];
  private commonCropOptions!: ICommonCropOptions;
  private frameCropperInstance!: FrameCropper;
  private inputCropperOptions!: ICropperOptions;

  public async crop(
    inputCropperOptions: ICropperOptions
  ): Promise<string> {
    this.inputCropperOptions = inputCropperOptions;
    await this.init();
    await this.decodeGIF();
    if (await this.checkIsStaticImage()) {
      return this.handleStaticImage()
    } else {
      const { resultFrames, frameDelays } = await this.cropFrames();
      return this.saveGif(resultFrames, frameDelays);
    }
  }

  private async init() {
    this.cropperInstance = this.inputCropperOptions.cropperInstance;
    // 合并初始值
    const defaultOptions: ICropOpts = {
      width: 100,
      height: 100,
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
      rotate: 0,
      left: 0,
      top: 0
    }
    const mergedCropperJsOpts = Object.assign(
      defaultOptions,
      this.inputCropperOptions.cropperJsOpts,
      this.cropperInstance?.getData()
    );

    const imageData = this.cropperInstance?.getImageData() ||
      await getImageInfo(this.inputCropperOptions.src)
    ;

    this.commonCropOptions = {
      cropperJsOpts: this.cropDataAdapter(mergedCropperJsOpts, imageData),
      imageData,
      cropBoxData: this.cropperInstance?.getCropBoxData() || mergedCropperJsOpts,
      withoutCropperJs: !this.cropperInstance
    }

    // ensure cropperInstance exist.
    // if (!this.inputCropperOptions.cropperInstance) {
    //   this.cropperInstance = await this.createCropperInstance(this.cropperOptions);
    // } else {
    //   this.cropperInstance = this.inputCropperOptions.cropperInstance;
    // }
  }

  private cropDataAdapter(
    mergedCropperJsOpts: ICropOpts & Cropper.Data,
    imageData: IImageData
  ): Required<ICropOpts> {
    mergedCropperJsOpts.left = mergedCropperJsOpts.x;
    mergedCropperJsOpts.top = mergedCropperJsOpts.y;
    mergedCropperJsOpts.width = mergedCropperJsOpts.width || imageData.naturalWidth;
    mergedCropperJsOpts.height = mergedCropperJsOpts.height || imageData.naturalHeight;
    return mergedCropperJsOpts as Required<ICropOpts>;
  }

  private createCropperInstance(options: ICropperOptions): Promise<CustomCropper> {
    return new Promise<CustomCropper>((resolve, reject) => {
      if (!options.src) {
        throw new Error('Option src must be specified.');
      }
      const img = document.createElement('img');
      img.src = options.src;
      if (this.imageInstance) {
        document.body.removeChild(this.imageInstance);
        this.cropperInstance?.destroy();
      }
      // 创建新的 image 图片 DOM
      this.imageInstance = document.createElement('img');
      this.imageInstance.src = options.src;
      this.imageInstance.style.display = 'none';
      document.body.append(this.imageInstance);
      if (this.preImageSrc !== options.src) {
        this.preImageSrc = options.src;
        this.imageInstance.src = options.src;
      }

      // 实例化一个 cropper
      const newInstance = new Cropper(this.imageInstance, {
        viewMode: 1,
        background: !!options.cropperJsOpts?.background,
        data: options.cropperJsOpts,
        autoCrop: true
      }) as CustomCropper;

      // 隐藏裁剪 DOM
      this.imageInstance.addEventListener('ready', () => {
        if (newInstance.cropper) {
          newInstance.cropper.style.display = 'none';
          if (options.cropperJsOpts?.width && this.imageInstance) {
            this.imageInstance.style.width = options.cropperJsOpts.width + 'px';
          }
          resolve(newInstance);
        }
      });

    })
  }

  private async decodeGIF() {
    const decoder = new Decoder(this.inputCropperOptions.src || this.cropperInstance?.url || '');
    const decodedGIFFrames = await decoder.decompressFrames();
    this.frames = decodedGIFFrames;
    return decodedGIFFrames;
  }

  private ensureFrameCropperExist() {
    if (!this.frameCropperInstance) {
      this.frameCropperInstance = new FrameCropper({
        commonCropOptions: this.commonCropOptions
      });
    }
  }

  private async cropFrames() {
    this.ensureFrameCropperExist();
    this.frameCropperInstance.updateConfig({
      commonCropOptions: this.commonCropOptions
    });
    return this.frameCropperInstance.cropGif(this.frames);
  }

  private async saveGif(resultFrames: ImageData[], frameDelays: number[]) {
    const syntheticGIF = new SyntheticGIF({
      frames: resultFrames,
      commonCropOptions: this.commonCropOptions,
      frameDelays
    });
    return syntheticGIF.bootstrap();
  }

  private async checkIsStaticImage(): Promise<boolean> {
    const url = this.cropperInstance?.url ?? this.inputCropperOptions?.src;
    const imageDataInfo = await getImageType(url);
    return imageDataInfo?.mime !== 'image/gif';
  }

  private async handleStaticImage(): Promise<string> {
    const imageInfo = await loadImage(this.inputCropperOptions.src);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = imageInfo.imageInstance.width;
    canvas.height = imageInfo.imageInstance.height;
    ctx?.drawImage(imageInfo.imageInstance, 0, 0);

    this.ensureFrameCropperExist();
    // 每次重新裁剪需要更新一下裁剪区域相关数据
    this.frameCropperInstance.updateConfig({
      commonCropOptions: this.commonCropOptions
    });
    const croppedImageData = await this.frameCropperInstance.cropStaticImage(canvas);
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = croppedImageData.width;
    canvas.height = croppedImageData.height;
    ctx?.putImageData(croppedImageData, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(null);
        const blobUrl = window.URL.createObjectURL(blob);
        resolve(blobUrl);
      })
    })
  }
}
