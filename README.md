# What
这是一个简单的图床实现，从Web上传图片至Cloudflare R2 存储。
使用Python Django实现

# 数据库结构
## images_cloudflarecredential
图床配置表
```sqlite
CREATE TABLE IF NOT EXISTS "images_cloudflarecredential" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "endpoint_url" varchar(200) NOT NULL, "access_key_id" varchar(100) NOT NULL, "secret_access_key" varchar(100) NOT NULL, "bucket" varchar(100) NOT NULL, access_url TEXT);
```

## images_image
图片信息表
```
CREATE TABLE IF NOT EXISTS "images_image" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "title" varchar(100) NOT NULL, "uploaded_at" datetime NOT NULL, "image" varchar(100) NOT NULL, url  TEXT);
```
# 设置
图床配置中

可以参阅Cloueflare的[R2开发文档](https://developers.cloudflare.com/r2)
- `endpoint_url` : 是R2的终结点 格式为`https://<account-id>.r2.cloudflarestorage.com`
- `access_key_id` : 是在R2申请的TokenID
- `secret_access_key` : 是在R2申请的Token密钥
- `bucket` : 是你要使用的储存桶名字
- `access_url` : 是你最终访问R2文件的url前缀，可以在R2 -> bucket -> setting 中找到，可以是r2.dev也可以是自定义域，你可能要处理跨域问题

你可以插入数据库，也可以用`python manage.py createsuperuser`生成管理员用户，在站点的/admin下管理数据。