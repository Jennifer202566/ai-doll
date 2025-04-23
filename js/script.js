/**
 * Main JavaScript for AI Doll Generator
 * Handles image upload, preview, and transformation
 */

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const mobileMenu = document.querySelector('.mobile-menu');
    const navLinks = document.querySelector('.nav-links');
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const originalPreview = document.getElementById('original-preview');
    const resultPreview = document.getElementById('result-preview');
    const changeImageBtn = document.getElementById('change-image-btn');
    const downloadBtn = document.getElementById('download-btn');
    const loadingElement = document.getElementById('loading');
    const faqItems = document.querySelectorAll('.faq-item');
    const styleOptions = document.querySelectorAll('input[name="style"]');
    const promptInput = document.getElementById('prompt-input');

    // Mobile Menu Toggle
    if (mobileMenu) {
        mobileMenu.addEventListener('click', function() {
            this.classList.toggle('active');
            navLinks.classList.toggle('active');
        });
    }

    // Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                // Close mobile menu if open
                if (mobileMenu && mobileMenu.classList.contains('active')) {
                    mobileMenu.classList.remove('active');
                    navLinks.classList.remove('active');
                }

                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });

    // File Upload Handling
    if (uploadArea && fileInput) {
        // Click on upload area
        uploadArea.addEventListener('click', function() {
            fileInput.click();
        });

        // Drag and drop functionality
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('active');
        });

        uploadArea.addEventListener('dragleave', function() {
            this.classList.remove('active');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('active');

            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                handleFile(e.dataTransfer.files[0]);
            }
        });

        // File input change
        fileInput.addEventListener('change', function() {
            if (this.files.length) {
                handleFile(this.files[0]);
            }
        });

        // Handle the selected file
        function handleFile(file) {
            // Validate file type
            const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
            if (!validTypes.includes(file.type)) {
                showError('Please upload a valid image file (JPG, PNG, or GIF).');
                return;
            }

            // Validate file size (5MB max)
            if (file.size > 5 * 1024 * 1024) {
                showError('File size exceeds 5MB. Please upload a smaller image.');
                return;
            }

            // Read and display the file
            const reader = new FileReader();
            reader.onload = function(e) {
                // 清除上传区域的内容
                while (uploadArea.firstChild) {
                    uploadArea.removeChild(uploadArea.firstChild);
                }

                // 创建并添加图片预览到上传区域
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.maxHeight = '200px';
                img.style.maxWidth = '100%';
                img.style.objectFit = 'contain';
                uploadArea.appendChild(img);

                // 添加提示文本
                const p = document.createElement('p');
                p.textContent = 'Image uploaded successfully! Click to change.';
                p.style.marginTop = '1rem';
                uploadArea.appendChild(p);

                // 设置原始预览图像
                originalPreview.src = e.target.result;

                // 显示加载动画
                loadingElement.style.display = 'block';

                // 调用 API 处理图像
                processImage(e.target.result);
            };
            reader.readAsDataURL(file);
        }

        // Process the image with API call
        async function processImage(imageData) {
            try {
                // 创建 FormData 对象
                const formData = new FormData();

                // 从 base64 字符串创建 Blob 对象
                const byteString = atob(imageData.split(',')[1]);
                const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);

                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }

                const blob = new Blob([ab], { type: mimeString });
                formData.append('image', blob, 'image.jpg');

                // 获取选中的风格
                let selectedStyle = 'Action Figure'; // 默认风格
                styleOptions.forEach(option => {
                    if (option.checked) {
                        selectedStyle = option.value;
                    }
                });
                formData.append('style', selectedStyle);

                // 获取提示词（如果有）
                if (promptInput && promptInput.value.trim()) {
                    formData.append('prompt', promptInput.value.trim());
                }

                // 调用 API 开始处理
                const response = await fetch('/api/convert', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error generating action figure: ${errorData.error || 'Unknown error'}`);
                }

                const data = await response.json();

                if (data.status === 'processing') {
                    // 如果状态是处理中，开始轮询结果
                    pollForResult(data.predictionId);
                } else if (data.status === 'success') {
                    // 如果立即成功（不太可能），显示结果
                    resultPreview.src = data.outputImage;
                    loadingElement.style.display = 'none';
                    previewContainer.style.display = 'block';
                } else {
                    throw new Error('Unexpected response from server');
                }
            } catch (error) {
                console.error('Error processing image:', error);
                loadingElement.style.display = 'none';
                showError(error.message || 'Error processing image. Please try again.');

                // 恢复上传区域
                resetUploadArea();
            }
        }

        // 轮询结果
        async function pollForResult(predictionId) {
            try {
                const response = await fetch(`/api/check-result?id=${predictionId}`);

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Error checking result: ${errorData.error || 'Unknown error'}`);
                }

                const data = await response.json();

                if (data.status === 'processing') {
                    // 如果仍在处理中，等待 3 秒后再次轮询
                    setTimeout(() => pollForResult(predictionId), 3000);
                } else if (data.status === 'success') {
                    // 处理成功，显示结果
                    resultPreview.src = data.outputImage;
                    loadingElement.style.display = 'none';
                    previewContainer.style.display = 'block';
                } else if (data.status === 'failed') {
                    // 处理失败
                    throw new Error(`Image generation failed: ${data.error || 'Unknown error'}`);
                } else {
                    throw new Error('Unexpected status from server');
                }
            } catch (error) {
                console.error('Error polling for result:', error);
                loadingElement.style.display = 'none';
                showError(error.message || 'Error generating image. Please try again.');

                // 恢复上传区域
                resetUploadArea();
            }
        }

        // 重置上传区域
        function resetUploadArea() {
            // 清除上传区域的内容
            while (uploadArea.firstChild) {
                uploadArea.removeChild(uploadArea.firstChild);
            }

            // 添加上传图标
            const uploadIcon = document.createElement('div');
            uploadIcon.className = 'upload-icon';
            uploadIcon.textContent = '📷';
            uploadArea.appendChild(uploadIcon);

            // 添加上传文本
            const uploadText = document.createElement('p');
            uploadText.className = 'upload-text';
            uploadText.innerHTML = 'Drag & drop your image here or <span>browse files</span>';
            uploadArea.appendChild(uploadText);

            // 添加文件信息
            const fileInfo = document.createElement('p');
            fileInfo.className = 'file-info';
            fileInfo.textContent = 'Supports JPG, PNG (Max 5MB)';
            uploadArea.appendChild(fileInfo);

            // 显示上传区域
            uploadArea.style.display = 'block';
            previewContainer.style.display = 'none';
            fileInput.value = '';
        }

        // Change image button
        if (changeImageBtn) {
            changeImageBtn.addEventListener('click', function() {
                // 使用重置函数恢复上传区域
                resetUploadArea();
            });
        }

        // Download button
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function() {
                if (resultPreview.src) {
                    const link = document.createElement('a');
                    link.href = resultPreview.src;
                    link.download = 'ai-doll-figure.jpg';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            });
        }
    }

    // FAQ Accordion
    if (faqItems.length) {
        faqItems.forEach(item => {
            const question = item.querySelector('.faq-question');

            question.addEventListener('click', function() {
                // Close all other items
                faqItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('active');
                    }
                });

                // Toggle current item
                item.classList.toggle('active');
            });
        });
    }

    // Helper function to show errors
    function showError(message) {
        alert(message);
    }
});

// Lazy load images
document.addEventListener('DOMContentLoaded', function() {
    const lazyImages = document.querySelectorAll('img[loading="lazy"]');

    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const image = entry.target;
                    image.src = image.dataset.src || image.src;
                    observer.unobserve(image);
                }
            });
        });

        lazyImages.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for browsers that don't support IntersectionObserver
        lazyImages.forEach(img => {
            img.src = img.dataset.src || img.src;
        });
    }
});
