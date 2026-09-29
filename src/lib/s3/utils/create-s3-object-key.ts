import { env } from "@/env";

type CreateS3ObjectKeyParams = {
  key: string;
};

/**
 * Бакет общий для всех проектов и окружений, поэтому каждый объект лежит в
 * папке окружения (`S3_PRIVATE_KEY_PREFIX`, например `genario/production`). В БД
 * ключи хранятся относительно этой папки, а она добавляется здесь, прямо перед
 * запросом в S3.
 */
export function createS3ObjectKey({ key }: CreateS3ObjectKeyParams) {
  return `${env.S3_PRIVATE_KEY_PREFIX}/${key}`;
}
