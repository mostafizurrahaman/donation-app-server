import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../config';

import httpStatus from 'http-status';
import AppError from './AppError';

// Initialize S3 Client
export const s3Client = new S3Client({
  region: config.awsConfig.region,
  credentials: {
    accessKeyId: config.awsConfig.accessKeyId!,
    secretAccessKey: config.awsConfig.secretAccessKey!,
  },
});

export const S3_BUCKET_NAME = config.awsConfig.s3BucketName!;

// TypeScript Interfaces
export interface IS3UploadParams {
  buffer: Buffer;
  key: string;
  contentType?: string;
  metadata?: Record<string, string>;
  folder?: string;
}

export interface IS3UploadResult {
  url: string;
  key: string;
}

export interface IS3SignedUrlParams {
  key: string;
  expiresIn?: number; // in seconds
}

/**
 * Upload file to S3
 */
export const uploadToS3 = async (
  params: IS3UploadParams
): Promise<IS3UploadResult> => {
  try {
    const fullKey = params.folder
      ? `${params.folder}/${params.key}`
      : params.key;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: fullKey,
      Body: params.buffer,
      ContentType: params.contentType || 'application/octet-stream',
      Metadata: params.metadata,
    });

    await s3Client.send(command);

    // Generate signed URL
    const signedUrl = await getSignedS3Url({
      key: fullKey,
      expiresIn: 7 * 24 * 60 * 60, // 7 days default
    });

    return {
      url: signedUrl,
      key: fullKey,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to upload file to S3: ${(error as Error).message}`
    );
  }
};

/**
 * Get signed URL for S3 object
 */
export const getSignedS3Url = async (
  params: IS3SignedUrlParams
): Promise<string> => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: params.key,
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: params.expiresIn || 7 * 24 * 60 * 60, // 7 days default
    });

    return url;
  } catch (error) {
    console.error('S3 signed URL error:', error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to generate signed URL: ${(error as Error).message}`
    );
  }
};

/**
 * Delete file from S3
 */
export const deleteFromS3 = async (key: string): Promise<void> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to delete file from S3: ${(error as Error).message}`
    );
  }
};

/**
 * Verify S3 connection
 */
export const verifyS3Connection = async (): Promise<boolean> => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: 'test-connection', // Non-existent key is fine for testing
    });

    await s3Client.send(command);
    console.log('✅ S3 connection verified');
    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      console.log('✅ S3 connection verified (bucket accessible)');
      return true;
    }
    console.error('❌ S3 connection error:', error);
    return false;
  }
};
