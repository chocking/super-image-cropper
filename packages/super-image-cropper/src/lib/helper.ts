import { IImageData } from '../index'
import imageType from 'image-type'

export type GetArrTypeUnion<T extends any[]> = T extends (infer I)[] ? I : never;
export type IImageLoadData = {
  imageInstance: HTMLImageElement;
  data: Event
}
export interface IImageTypeInfo {
  ext: string;
  mime: string;
}

export const getImageInfo = async (src: string = ''): Promise<IImageData> => {
    if (!src) return {
      width: 0,
      height: 0,
      naturalWidth: 0,
      naturalHeight: 0,
    };
    const { imageInstance } = await loadImage(src);
    return {
      width: imageInstance.width,
      height: imageInstance.height,
      naturalWidth: imageInstance.naturalWidth,
      naturalHeight: imageInstance.naturalHeight,
    };
}

export const loadImage = (src: string = ''): Promise<IImageLoadData> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = function(data) {
      resolve({
        imageInstance: image,
        data
      })
    }
    image.src = src;
    image.onerror = reject;
  })
}

export const getImageBufferFromRemote = (url: string = ''): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      resolve(xhr.response);
    };

    xhr.onerror = reject;

    xhr.send();
  })
}

export const getImageType = async (url: string = ''): Promise<IImageTypeInfo | null> => {
  const imageBufferData = await getImageBufferFromRemote(url);
  const imageTypeInfo = imageType(new Uint8Array(imageBufferData));
  return imageTypeInfo;
}