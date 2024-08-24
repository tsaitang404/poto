from django.db import models

# Create your models here.

class Image(models.Model):
    title = models.CharField(max_length=100)
    image = models.ImageField(upload_to='images/tmp/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    url = models.URLField(max_length=100)

    class Meta:
        app_label = 'images'


class CloudflareCredential(models.Model):
    endpoint_url = models.URLField(max_length=200)
    access_key_id = models.CharField(max_length=100)
    secret_access_key = models.CharField(max_length=100)
    bucket = models.CharField(max_length=100)
    access_url = models.URLField(max_length=100)

    def __str__(self):
        return f"CloudflareStorageCredential for {self.endpoint_url}"
