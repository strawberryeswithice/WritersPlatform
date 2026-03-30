import io
import json
import base64
import uuid
from typing import Optional
from datetime import timedelta

from minio import Minio
from minio.error import S3Error
from PIL import Image

from project_service.app.core.config import settings


class MinioClient:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self.bucket_name = settings.MINIO_BUCKET
        self._ensure_bucket()

    def _ensure_bucket(self):
        if not self.client.bucket_exists(self.bucket_name):
            self.client.make_bucket(self.bucket_name)
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{self.bucket_name}/*"],
                }
            ],
        }

        try:
            self.client.set_bucket_policy(self.bucket_name, json.dumps(policy))
        except S3Error as e:
            print(f"Error setting bucket policy: {e}")

    def upload_photo(self, image_data: str, filename: Optional[str] = None) -> Optional[str]:
        try:
            if ',' in image_data:
                header, data = image_data.split(',', 1)
                if 'jpeg' in header or 'jpg' in header:
                    ext = 'jpg'
                elif 'png' in header:
                    ext = 'png'
                else:
                    ext = 'jpg'
            else:
                data = image_data
                ext = 'jpg'

            image_bytes = base64.b64decode(data)
            img = Image.open(io.BytesIO(image_bytes))

            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            max_size = 2000
            if img.width > max_size or img.height > max_size:
                img.thumbnail((max_size, max_size), Image.LANCZOS)

            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=92, optimize=True)
            buffer.seek(0)

            if not filename:
                filename = f"{uuid.uuid4().hex}.{ext}"

            object_name = f"characters/{filename}"

            self.client.put_object(
                self.bucket_name,
                object_name,
                buffer,
                length=buffer.getbuffer().nbytes,
                content_type='image/jpeg',
            )
            return object_name

        except Exception as e:
            return None

    def get_photo_url(self, object_name: str, expires: int = 3600) -> Optional[str]:
        if not object_name:
            return None

        try:
            if settings.MINIO_PUBLIC_URL:
                url = f"{settings.MINIO_PUBLIC_URL}/{self.bucket_name}/{object_name}"
                return url

            url = self.client.presigned_get_object(
                self.bucket_name,
                object_name,
                expires=timedelta(seconds=expires)
            )
            return url

        except Exception as e:
            return None

    def delete_photo(self, object_name: str) -> bool:
        try:
            self.client.remove_object(self.bucket_name, object_name)
            return True
        except S3Error as e:
            return False

minio_client = MinioClient()