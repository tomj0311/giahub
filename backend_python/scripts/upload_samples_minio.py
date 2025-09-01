import os
from io import BytesIO
from minio import Minio


def dummy_files():
    return [
        ("sample.jpg", b"\xff\xd8\xffDUMMYJPEG", "image/jpeg"),
        ("sample.png", b"\x89PNG\r\n\x1a\nDUMMYPNG", "image/png"),
        ("sample.txt", b"hello world", "text/plain"),
        ("sample.json", b"{\n  \"ok\": true\n}", "application/json"),
        ("sample.csv", b"a,b,c\n1,2,3\n", "text/csv"),
        ("sample.pdf", b"%PDF-1.4\n%Dummy PDF\n", "application/pdf"),
        ("sample.docx", b"DUMMY-DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ]


def main():
    endpoint = os.getenv("MINIO_ENDPOINT", "127.0.0.1:8803")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
    bucket = os.getenv("MINIO_BUCKET", "hcp")
    email = os.getenv("UPLOAD_EMAIL", "test@test.com")

    client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)

    for name, data, content_type in dummy_files():
        object_name = f"{email}/{name}"
        client.put_object(bucket, object_name, BytesIO(data), len(data), content_type=content_type)
        print(f"Uploaded {object_name} -> {len(data)} bytes")


if __name__ == "__main__":
    main()
