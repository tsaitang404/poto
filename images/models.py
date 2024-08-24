from django.db import models

# Create your models here.

class Image(models.Model):
    title = models.CharField(max_length=100)
    image = models.ImageField(upload_to='images/tmp/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'images'
