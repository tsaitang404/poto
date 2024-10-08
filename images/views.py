from django.shortcuts import render, redirect
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from django.contrib.auth import authenticate, login
from django.conf import settings
from .forms import ImageForm
from .models import Image, Configuration
from .utils import CloudflareStorage
from PIL import Image as PILImage
import shutil
import os


# @csrf_exempt  # 可以使用csrf_exempt装饰器，暂时关闭 CSRF 保护
def upload_image(request):
    if not request.session.get('password_verified'):
        return HttpResponse("Access denied. Please verify your password <a href='/protected/'>here</a>.")
    else:
        if request.method == 'POST':
            form = ImageForm(request.POST, request.FILES)
            if form.is_valid():
                ci = Configuration.objects.first()
                cf_storage = CloudflareStorage(ci.endpoint_url,ci.access_key_id,ci.secret_access_key,ci.bucket)  # 在这里实例化
                image = form.save()  # 直接保存表单数据到数据库
                img = PILImage.open(image.image)
                new_image_name = f"images/tmp/{image.id}.webp"
                img.save(os.path.join(settings.MEDIA_ROOT, new_image_name), "WEBP")
                # 保存成功后自动跳转到图片视图页面
                try:
                    with open(os.path.join(settings.MEDIA_ROOT, new_image_name), "rb") as f:
                        cf_storage.upload_file(f.read(), f"{image.id}.webp")
                    shutil.rmtree("images/tmp/")
                    print(image.url)
                    image.url = ci.access_url+ '/' +str(image.id)+ '.webp'
                    image.save()
                except Exception as e:
                    print(e)
                return redirect('view_image', image_id=image.id)  # 重定向到视图函数，并传递 image_id 参数
        else:
            form = ImageForm()
        return render(request, 'upload.html', {'form': form})

def view_image(request, image_id):
    image = Image.objects.get(id=image_id)
    return render(request, 'view.html', {'image': image})

@csrf_exempt 
def protected(request):
    if request.method == 'POST':
        password = request.POST.get('password', '')
        if password == '':
            return render(request, 'protected.html')
        elif password == Configuration.objects.first().password:  
            request.session['password_verified'] = True
            return redirect('upload_image')  # 密码验证成功后重定向到上传图片页面
        else:
            return render(request, 'protected.html', {'error_message': 'Incorrect password.'})

    else:
        return render(request, 'protected.html')




