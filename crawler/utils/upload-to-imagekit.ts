import 'reflect-metadata';
import * as dotenv from 'dotenv';
// @ts-ignore
import * as ImageKit from 'imagekit';
import { isString } from 'lodash';

dotenv.config();

interface ImagekitUploadResult {
  fileId: string | null;
  name: string | null;
  height: number | null;
  width: number | null;
}

interface ImagekitClient {
  upload: (params: { file: string; fileName: string; folder: string }) => Promise<ImagekitUploadResult>;
}

let imagekit: ImagekitClient | null = null;

const getImagekitClient = (): ImagekitClient => {
  if (imagekit !== null) {
    return imagekit;
  }

  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  const missingKeys = [
    publicKey ? '' : 'IMAGEKIT_PUBLIC_KEY',
    privateKey ? '' : 'IMAGEKIT_PRIVATE_KEY',
    urlEndpoint ? '' : 'IMAGEKIT_URL_ENDPOINT',
  ].filter((key) => key.length > 0);

  if (missingKeys.length > 0) {
    throw new Error(`missing required env ${missingKeys.join(', ')}`);
  }

  imagekit = new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint,
  }) as ImagekitClient;
  return imagekit;
};

export default (wallpaperFileName: string, wallpaperId: string): Promise<ImagekitUploadResult> =>
  new Promise((resolve, reject) => {
    if (isString(wallpaperFileName) === false || wallpaperFileName.length === 0) {
      reject(new Error('uploadToImagekit: must need wallpaper file name.'));
      return;
    }

    let client: ImagekitClient;
    try {
      client = getImagekitClient();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`>>> [IMAGEKIT] 未配置或初始化失败，跳过 ImageKit 上传：${reason}`);
      resolve({
        fileId: null,
        name: null,
        height: null,
        width: null,
      });
      return;
    }

    // imagekit SDK upload
    client
      .upload({
        file: `https://cn.bing.com/th?id=${wallpaperFileName}_UHD.jpg&rf=LaDigue_UHD.jpg`,
        fileName: wallpaperId,
        folder: 'bing-wallpapers',
      })
      .then((imagekitFile) => {
        resolve(imagekitFile);
      })
      .catch((error) => {
        reject(error);
      });
  });
