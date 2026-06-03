import io
import json
import base64
import uuid
from pathlib import Path
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
        self.text_bucket  = settings.MINIO_TEXT_BUCKET
        self.bg_bucket = 'app-backgrounds'

        self._ensure_bucket(self.bucket_name)
        self._ensure_bucket(self.text_bucket)
        self._ensure_bucket(self.bg_bucket)

    def _ensure_bucket(self, bucket: str):
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)
            print(f"[minio] created bucket: {bucket}")
        policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{bucket}/*"],
            }],
        }
        try:
            self.client.set_bucket_policy(bucket, json.dumps(policy))
            print(f"[minio] public-read policy applied to: {bucket}")
        except S3Error as e:
            print(f"[minio] Error setting bucket policy for {bucket}: {e}")

    def upload_background_images(self, static_dir: str):
        files = {
            'bg1.png':    ('bg1.png',    'image/png'),
            'bg10.jpg':   ('bg10.jpg',   'image/jpeg'),
            'bg9.jpg':    ('bg9.jpg',    'image/jpeg'),
            'stars2.png': ('stars2.png', 'image/png'),
            'text.png':   ('text.png',   'image/png'),
        }
        for src_name, (obj_name, ctype) in files.items():
            src = Path(static_dir) / src_name
            if not src.exists():
                print(f"[minio] background not found locally: {src}")
                continue
            try:
                with open(src, 'rb') as f:
                    data = f.read()
                self.client.put_object(
                    self.bg_bucket, obj_name,
                    io.BytesIO(data), len(data),
                    content_type=ctype,
                )
                print(f"[minio] uploaded {obj_name} -> {self.bg_bucket}")
            except Exception as e:
                print(f"[minio] Error uploading {obj_name}: {e}")

    def _decode_and_resize(self, image_data: str, max_size: int = 2000):
        if ',' in image_data:
            header, data = image_data.split(',', 1)
            ext = 'png' if 'png' in header else 'jpg'
        else:
            data = image_data
            ext = 'jpg'
        image_bytes = base64.b64decode(data)
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        if img.width > max_size or img.height > max_size:
            img.thumbnail((max_size, max_size), Image.LANCZOS)
        return img, ext

    def _save_img_to_minio(self, img: Image.Image, object_name: str, quality: int = 92) -> Optional[str]:
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=quality, optimize=True)
        buffer.seek(0)
        try:
            self.client.put_object(
                self.bucket_name, object_name,
                buffer, buffer.getbuffer().nbytes,
                content_type='image/jpeg',
            )
            return object_name
        except Exception as e:
            print(f"MinIO upload error: {e}")
            return None

    def upload_photo(self, image_data: str, filename: Optional[str] = None) -> Optional[str]:
        try:
            img, ext = self._decode_and_resize(image_data, max_size=2000)
            if not filename:
                filename = f"{uuid.uuid4().hex}.jpg"
            object_name = f"characters/{filename}"
            return self._save_img_to_minio(img, object_name)
        except Exception as e:
            print(f"upload_photo error: {e}")
            return None

    def upload_photo_pair(self, thumb_data: str, full_data: Optional[str] = None,
                          base_name: Optional[str] = None) -> 'tuple[Optional[str], Optional[str]]':
        base = base_name or uuid.uuid4().hex
        thumb_path = None
        full_path = None
        try:
            if thumb_data and thumb_data.startswith('data:image'):
                img_thumb, _ = self._decode_and_resize(thumb_data, max_size=600)
                thumb_path = self._save_img_to_minio(img_thumb, f"characters/{base}_thumb.jpg")
        except Exception as e:
            print(f"Thumbnail upload error: {e}")
        try:
            if full_data and full_data.startswith('data:image'):
                img_full, _ = self._decode_and_resize(full_data, max_size=2000)
                full_path = self._save_img_to_minio(img_full, f"characters/{base}_full.jpg", quality=88)
        except Exception as e:
            print(f"Full image upload error: {e}")
        return thumb_path, full_path

    def get_photo_url(self, object_name: str, expires: int = 3600) -> Optional[str]:
        if not object_name:
            return None
        try:
            if settings.MINIO_PUBLIC_URL:
                return f"{settings.MINIO_PUBLIC_URL}/{self.bucket_name}/{object_name}"
            return self.client.presigned_get_object(
                self.bucket_name, object_name, expires=timedelta(seconds=expires))
        except Exception:
            return None

    def delete_photo(self, object_name: str) -> bool:
        try:
            self.client.remove_object(self.bucket_name, object_name)
            return True
        except S3Error:
            return False

    def upload_chapter_text(self, content: str, chapter_id: int) -> Optional[str]:
        object_name = f"chapters/{chapter_id}/{uuid.uuid4().hex}.txt"
        try:
            data = content.encode("utf-8")
            self.client.put_object(
                self.text_bucket,
                object_name,
                io.BytesIO(data),
                len(data),
                content_type="text/plain; charset=utf-8",
            )
            return object_name
        except Exception as e:
            print(f"MinIO upload_chapter_text error: {e}")
            return None

    def get_chapter_text(self, object_name: str) -> Optional[str]:
        if not object_name:
            return None
        try:
            response = self.client.get_object(self.text_bucket, object_name)
            content = response.read().decode("utf-8")
            response.close()
            response.release_conn()
            return content
        except S3Error as e:
            print(f"MinIO get_chapter_text error: {e}")
            return None

    def delete_chapter_text(self, object_name: str) -> bool:
        if not object_name:
            return False
        try:
            self.client.remove_object(self.text_bucket, object_name)
            return True
        except S3Error as e:
            print(f"MinIO delete_chapter_text error: {e}")
            return False


minio_client = MinioClient()