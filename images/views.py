from django.shortcuts import render

# Create your views here.
from django.shortcuts import render, redirect
from .forms import ImageForm
from .models import Image

def upload_image(request):
    if request.method == 'POST':
        form = ImageForm(request.POST, request.FILES)
        if form.is_valid():
            image = form.save()
            # 保存成功后自动跳转到图片视图页面
            return redirect('view_image', image_id=image.id)
    else:
        form = ImageForm()
    return render(request, 'upload.html', {'form': form})

def view_image(request, image_id):
    image = Image.objects.get(id=image_id)
    return render(request, 'view.html', {'image': image})

