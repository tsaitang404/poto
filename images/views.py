from django.shortcuts import render, redirect
from .forms import ImageForm
from .models import Image
from PIL import Image as PILImage
from django.conf import settings
from django.http import HttpResponseBadRequest
import os
# Create your views here.

def upload_image(request):
    if request.method == 'POST':
        form = ImageForm(request.POST, request.FILES)
        if form.is_valid():
            image = form.save()  # 直接保存表单数据到数据库
            img = PILImage.open(image.image)
            new_image_name = f"images/tmp/{image.id}.webp"
            img.save(os.path.join(settings.MEDIA_ROOT, new_image_name), "WEBP")
            # 保存成功后自动跳转到图片视图页面
            return redirect('view_image', image_id=image.id)  # 重定向到视图函数，并传递 image_id 参数
    else:
        form = ImageForm()
    return render(request, 'upload.html', {'form': form})

def view_image(request, image_id):
    image = Image.objects.get(id=image_id)
    return render(request, 'view.html', {'image': image})

