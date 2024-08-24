from django.shortcuts import render, redirect
from .forms import ImageForm
from .models import Image, CloudflareCredential
from PIL import Image as PILImage
import os
from .utils import CloudflareStorage
from django.conf import settings

def upload_image(request):
    if request.method == 'POST':
        form = ImageForm(request.POST, request.FILES)
        if form.is_valid():
            ci = CloudflareCredential.objects.first()
            cf_storage = CloudflareStorage(ci.endpoint_url,ci.access_key_id,ci.secret_access_key,ci.bucket)  # 在这里实例化
            image = form.save()  # 直接保存表单数据到数据库
            img = PILImage.open(image.image)
            new_image_name = f"images/tmp/{image.id}.webp"
            img.save(os.path.join(settings.MEDIA_ROOT, new_image_name), "WEBP")
            # 保存成功后自动跳转到图片视图页面
            with open(os.path.join(settings.MEDIA_ROOT, new_image_name), "rb") as f:
                cf_storage.upload_file(f.read(), f"{image.id}.webp")
            return redirect('view_image', image_id=image.id)  # 重定向到视图函数，并传递 image_id 参数
    else:
        form = ImageForm()
    return render(request, 'upload.html', {'form': form})

def view_image(request, image_id):
    image = Image.objects.get(id=image_id)
    return render(request, 'view.html', {'image': image})


