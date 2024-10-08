from django.contrib import admin
from .models import Configuration,Image

# Register your models here.
@admin.register(Image)
class Image(admin.ModelAdmin):
    list_display = ('title','image','uploaded_at')

@admin.register(Configuration)
class CloudflareCredentialAdmin(admin.ModelAdmin):
    list_display = ('endpoint_url', 'access_key_id','secret_access_key')
