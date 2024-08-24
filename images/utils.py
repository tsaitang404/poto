import io
import boto3

class CloudflareStorage:
    def __init__(self, endpoint_url, access_key_id, secret_access_key, bucket_name):
        self.endpoint_url = endpoint_url
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.bucket_name = bucket_name
        self.s3 = boto3.client('s3', endpoint_url=endpoint_url, aws_access_key_id=access_key_id, aws_secret_access_key=secret_access_key)

    # 获取对象信息
    def obj_info(self, file_key_name):
        object_information = self.s3.head_object(Bucket=self.bucket_name, Key=file_key_name)
        return object_information

    # 上传/更新单个文件
    def upload_file(self, file_content, file_key_name):
        self.s3.upload_fileobj(io.BytesIO(file_content), self.bucket_name, file_key_name)

    # 删除对象
    def delete_obj(self, file_key_name):
        self.s3.delete_object(Bucket=self.bucket_name, Key=file_key_name)
