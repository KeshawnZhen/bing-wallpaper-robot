import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Chevereto NAS 图床同步
 * ------------------------------------------------------------------
 * 定位：
 *   - 只做 NAS 侧备份/归档，不作为每日采集主流程的强依赖。
 *   - 未配置环境变量时完全跳过；上传失败只返回 error，不 throw。
 *   - 使用 Chevereto 的 URL source 上传能力，让 Chevereto/NAS 从 Bing 拉取 UHD 原图，
 *     避免 GitHub Action 先下载大图再二次上传。
 *
 * 所需环境变量：
 *   CHEVERETO_API_URL   必填。可填站点根地址或完整 /api/1/upload 地址。
 *   CHEVERETO_API_KEY   必填。Chevereto API key。
 *   CHEVERETO_ALBUM_ID  选填。目标相册 ID。
 */

export type NasBackupStatus = 'uploaded' | 'skipped' | 'error';

export interface NasBackupResult {
  status: NasBackupStatus;
  key: string;
  url?: string;
  reason?: string;
}

interface CheveretoImageData {
  url?: string;
  display_url?: string;
  image?: {
    url?: string;
    display_url?: string;
  };
}

interface CheveretoResponse {
  status_code?: number;
  success?: boolean;
  image?: CheveretoImageData;
  error?: {
    message?: string;
  };
  message?: string;
}

const toBingSourceUrl = (filename: string): string => `https://cn.bing.com/th?id=${filename}_UHD.jpg`;

const normalizeUploadUrl = (rawUrl: string): string => {
  const trimmedUrl = rawUrl.trim().replace(/\/+$/, '');
  if (/\/api\/\d+\/upload$/i.test(trimmedUrl)) {
    return trimmedUrl;
  }
  return `${trimmedUrl}/api/1/upload`;
};

export const isCheveretoConfigured = (): boolean =>
  Boolean(process.env.CHEVERETO_API_URL && process.env.CHEVERETO_API_KEY);

let hasWarnedUnavailable = false;
const warnOnce = (message: string): void => {
  if (!hasWarnedUnavailable) {
    hasWarnedUnavailable = true;
    console.log(`>>> [NAS] ${message}（本次运行仅提示一次，Chevereto 同步将被跳过，不影响主流程）`);
  }
};

const getUploadedUrl = (data: CheveretoResponse): string | undefined =>
  data.image?.url || data.image?.display_url || data.image?.image?.url || data.image?.image?.display_url;

export const uploadToNas = async (
  filename: string,
  metadata?: {
    title?: string | null;
    tags?: string[];
  },
): Promise<NasBackupResult> => {
  const key = `chevereto/${filename}.jpg`;

  if (typeof filename !== 'string' || filename.length === 0) {
    return { status: 'skipped', key, reason: 'invalid-filename' };
  }

  if (!isCheveretoConfigured()) {
    warnOnce('未配置 CHEVERETO_API_URL/CHEVERETO_API_KEY');
    return { status: 'skipped', key, reason: 'not-configured' };
  }

  try {
    const apiUrl = normalizeUploadUrl(process.env.CHEVERETO_API_URL as string);
    const params = new URLSearchParams();
    params.set('key', process.env.CHEVERETO_API_KEY as string);
    params.set('source', toBingSourceUrl(filename));
    params.set('title', metadata?.title || filename);
    params.set('name', filename);
    params.set('format', 'json');

    const tags = metadata?.tags?.filter((tag) => tag.length > 0);
    if (tags && tags.length > 0) {
      params.set('tags', tags.join(','));
    }

    if (process.env.CHEVERETO_ALBUM_ID) {
      params.set('album_id', process.env.CHEVERETO_ALBUM_ID);
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const responseText = await response.text();

    let data: CheveretoResponse;
    try {
      data = JSON.parse(responseText) as CheveretoResponse;
    } catch {
      return {
        status: 'error',
        key,
        reason: `invalid-json-response-${response.status}`,
      };
    }

    const uploadedUrl = getUploadedUrl(data);
    if (response.ok && (data.success === true || data.status_code === 200) && uploadedUrl) {
      return { status: 'uploaded', key, url: uploadedUrl };
    }

    return {
      status: 'error',
      key,
      reason: data.error?.message || data.message || `upload-status-${response.status}`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'error', key, reason };
  }
};

export default uploadToNas;
