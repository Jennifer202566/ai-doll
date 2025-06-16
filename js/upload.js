// upload.js - Handles image upload functionality

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    // 注意：uploadIcon可能不存在，我们将在需要时创建它
    const generateBtn = document.getElementById('generate-btn');
    const resultSection = document.getElementById('result-section');
    const originalPreview = document.getElementById('original-preview');
    const newImageBtn = document.getElementById('new-image-btn');

    // Event Listeners
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    newImageBtn.addEventListener('click', resetUpload);

    // Handle file selection via input
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            validateAndProcessFile(file);
        }
    }

    // Handle drag over
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
    }

    // Handle drag leave
    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
    }

    // Handle drop
    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');

        const file = e.dataTransfer.files[0];
        if (file) {
            validateAndProcessFile(file);
        }
    }

    // Validate and process the file
    function validateAndProcessFile(file) {
        // Check file type
        if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
            alert('Please upload a JPEG or PNG image.');
            return;
        }

        // Check file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
            alert('Please upload an image smaller than 5MB.');
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
            img.style.width = '80%';
            img.style.height = 'auto';
            img.style.minHeight = '200px';
            img.style.maxHeight = '300px';
            img.style.objectFit = 'contain';
            img.style.border = '2px solid #6366f1';
            img.style.borderRadius = '8px';
            img.style.padding = '4px';
            img.style.backgroundColor = 'white';
            uploadArea.appendChild(img);

            // 添加提示文本
            const p = document.createElement('p');
            p.textContent = 'Image uploaded successfully! Click to change.';
            p.style.marginTop = '1rem';
            uploadArea.appendChild(p);

            // Display original image
            originalPreview.src = e.target.result;

            // Store the image data for later use
            window.uploadedImage = {
                data: e.target.result,
                file: file
            };

            // Enable generate button
            generateBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    // Reset upload area
    function resetUpload() {
        // Hide result section
        resultSection.style.display = 'none';

        // Clear file input
        fileInput.value = '';

        // Clear uploaded image data
        window.uploadedImage = null;

        // Reset original preview
        originalPreview.src = '';

        // 恢复默认上传区域内容
        while (uploadArea.firstChild) {
            uploadArea.removeChild(uploadArea.firstChild);
        }

        // 恢复默认上传区域内容
        const icon = document.createElement('img');
        icon.src = 'images/upload-icon.png';
        icon.alt = 'Upload Icon';
        icon.id = 'upload-icon';

        const p1 = document.createElement('p');
        p1.className = 'upload-text';
        p1.innerHTML = 'Drag & drop your image here or <span>browse files</span>';

        const p2 = document.createElement('p');
        p2.className = 'file-info';
        p2.textContent = 'Supports JPG, PNG (Max 5MB)';

        uploadArea.appendChild(icon);
        uploadArea.appendChild(p1);
        uploadArea.appendChild(p2);

        // Show upload section
        document.querySelector('.upload-section').style.display = 'block';
        // 滚动到上传区域
        uploadArea.scrollIntoView({ behavior: 'smooth' });
    }

    // Export functions for use in other scripts
    window.uploadModule = {
        resetUpload: resetUpload,
        getUploadedImage: function() {
            return window.uploadedImage;
        }
    };
});
