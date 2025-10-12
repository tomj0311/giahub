"""Thin MinIO wrapper to centralize object storage operations.

Supports basic operations used by the app: ensure bucket, upload bytes/streams,
download to bytes, list, and delete. Reads connection defaults from backend.CONFIG
but allows explicit params for testability.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional
import io
import os
from datetime import timedelta

try:
    from minio import Minio
    from minio.error import S3Error
except Exception:  # pragma: no cover - imported lazily by callers/tests
    Minio = object  # type: ignore
    class S3Error(Exception):  # type: ignore
        pass


@dataclass
class MinioConfig:
    endpoint: str
    access_key: str
    secret_key: str
    secure: bool = False
    bucket: str = "h8gia"


class MinioClient:
    def __init__(
        self,
        endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        secure: Optional[bool] = None,
        default_bucket: Optional[str] = None,
    ) -> None:
        # Prefer explicit args; fall back to backend.CONFIG envs to avoid tight coupling
        if endpoint is None or access_key is None or secret_key is None or secure is None or default_bucket is None:
            try:
                from backend.config import CONFIG  # type: ignore
                endpoint = endpoint or f"{CONFIG.minio_host}:{CONFIG.minio_port}"
                access_key = access_key or CONFIG.minio_access_key
                secret_key = secret_key or CONFIG.minio_secret_key
                secure = CONFIG.minio_secure if secure is None else secure
                default_bucket = default_bucket or CONFIG.minio_bucket
            except Exception:
                # As a last resort, use envs
                host = os.getenv("MINIO_HOST")
                port = int(os.getenv("MINIO_PORT"))
                endpoint = endpoint or f"{host}:{port}"
                access_key = access_key or os.getenv("MINIO_ACCESS_KEY")
                secret_key = secret_key or os.getenv("MINIO_SECRET_KEY")
                secure = (os.getenv("MINIO_SECURE", "false").lower() == "true") if secure is None else secure
                default_bucket = default_bucket or os.getenv("MINIO_BUCKET")

        self._cfg = MinioConfig(
            endpoint=endpoint, access_key=access_key, secret_key=secret_key, secure=bool(secure), bucket=default_bucket  # type: ignore[arg-type]
        )
        self._client = Minio(self._cfg.endpoint, access_key=self._cfg.access_key, secret_key=self._cfg.secret_key, secure=self._cfg.secure)

    @property
    def bucket(self) -> str:
        return self._cfg.bucket

    def ensure_bucket(self, bucket: Optional[str] = None) -> None:
        b = bucket or self.bucket
        found = self._client.bucket_exists(b)
        if not found:
            self._client.make_bucket(b)

    def put_bytes(self, key: str, data: bytes, content_type: Optional[str] = None, bucket: Optional[str] = None) -> None:
        b = bucket or self.bucket
        self.ensure_bucket(b)
        length = len(data)
        self._client.put_object(b, key, io.BytesIO(data), length=length, content_type=content_type)

    def put_stream(self, key: str, stream: io.BytesIO | io.BufferedReader, length: int, content_type: Optional[str] = None, bucket: Optional[str] = None) -> None:
        b = bucket or self.bucket
        self.ensure_bucket(b)
        self._client.put_object(b, key, stream, length=length, content_type=content_type)

    def get_bytes(self, key: str, bucket: Optional[str] = None) -> bytes:
        b = bucket or self.bucket
        resp = self._client.get_object(b, key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    def delete(self, key: str, bucket: Optional[str] = None) -> None:
        b = bucket or self.bucket
        self._client.remove_object(b, key)

    def list(self, prefix: str = "", recursive: bool = True, bucket: Optional[str] = None) -> Iterable[str]:
        b = bucket or self.bucket
        for obj in self._client.list_objects(b, prefix=prefix, recursive=recursive):
            yield obj.object_name  # type: ignore[attr-defined]

    def exists(self, key: str, bucket: Optional[str] = None) -> bool:
        """Check if an object exists in the bucket"""
        b = bucket or self.bucket
        try:
            self._client.stat_object(b, key)
            return True
        except S3Error:
            return False

    def presign_put(self, key: str, expires_seconds: int = 3600, bucket: Optional[str] = None) -> str:
        """Return a presigned URL for PUT of the given key.

        Uses the configured MinIO endpoint and credentials; caller can use
        the returned URL in a browser fetch PUT without additional auth headers.
        """
        b = bucket or self.bucket
        # Ensure bucket exists before generating a presigned URL
        self.ensure_bucket(b)
        # MinIO client expects timedelta for expires
        return self._client.presigned_put_object(b, key, expires=timedelta(seconds=expires_seconds))

__all__ = ["MinioClient", "MinioConfig", "S3Error"]
