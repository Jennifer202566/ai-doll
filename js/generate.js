// generate.js - Handles the AI generation process

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const generateBtn = document.getElementById('generate-btn');
    const promptInput = document.getElementById('prompt-input');
    const resultSection = document.getElementById('result-section');
    const uploadSection = document.querySelector('.upload-section');
    const resultPreview = document.getElementById('result-preview');
    // originalPreview 只用于参考，不直接使用
    const loading = document.getElementById('loading');
    const downloadBtn = document.getElementById('download-btn');
    const resultContainer = document.querySelector('.result-container');
    const resultActions = document.querySelector('.result-actions');

    // Event Listeners
    if (generateBtn) generateBtn.addEventListener('click', generateActionFigure);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadImage);

    // Generate action figure
    async function generateActionFigure() {
        // Get uploaded image
        const uploadedImage = window.uploadModule.getUploadedImage();
        if (!uploadedImage) {
            alert('Please upload an image first.');
            return;
        }

        // Get prompt and style
        const prompt = promptInput ? promptInput.value.trim() : '';
        const style = document.querySelector('input[name="style"]:checked').value;

        // Show loading state
        if (uploadSection) uploadSection.style.display = 'none';
        if (resultSection) resultSection.style.display = 'block';
        if (loading) loading.style.display = 'block';
        if (resultContainer) resultContainer.style.display = 'none';
        if (resultActions) resultActions.style.display = 'none';

        // 添加按钮动画效果
        generateBtn.classList.add('pulse');
        setTimeout(() => {
            generateBtn.classList.remove('pulse');
        }, 1000);

        try {
            // 显示加载动画
            if (loading) loading.style.display = 'block';

            // 调用后端 API 生成 AI 人偶
            console.log('开始生成AI人偶...');
            console.log('使用风格:', style);
            console.log('使用提示词:', prompt || '无提示词');

            // 创建 FormData 对象
            const formData = new FormData();

            // 将 base64 图像转换为 Blob
            const byteString = atob(uploadedImage.data.split(',')[1]);
            const mimeString = uploadedImage.data.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], {type: mimeString});

            // 添加文件和其他参数
            formData.append('image', blob, 'image.jpg');
            formData.append('style', style);
            if (prompt) {
                formData.append('prompt', prompt);
            }

            // 发送请求
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();

            if (data.status === 'success') {
                // 处理图片URL，确保能正确显示
                let imageUrl = data.outputImage;
                
                // 如果是Replicate URL，可以直接使用，不需要代理
                console.log('收到的图片URL:', imageUrl);
                
                // 直接显示结果
                handleSuccessfulGeneration(imageUrl);
                console.log('AI人偶生成完成!');
            } else {
                throw new Error(data.error || 'No image generated');
            }

        } catch (error) {
            console.error('Error generating action figure:', error);
            alert('Error generating action figure: ' + error.message);
            if (loading) loading.style.display = 'none';
            if (uploadSection) uploadSection.style.display = 'block';
            if (resultSection) resultSection.style.display = 'none';
        }
    }

    // 处理成功生成的结果
    function handleSuccessfulGeneration(imageUrl) {
        console.log('设置图片URL:', imageUrl);
        
        // 设置图片源
        if (resultPreview) {
            resultPreview.onerror = function() {
                console.error('图片加载失败:', imageUrl);
                alert('无法加载生成的图片。请尝试刷新页面或重新生成。');
                // 尝试使用代理
                const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
                console.log('尝试使用代理URL:', proxyUrl);
                resultPreview.src = proxyUrl;
            };
            
            resultPreview.src = imageUrl;
        }
        
        window.generatedImage = imageUrl;
        if (loading) loading.style.display = 'none';
        if (resultContainer) resultContainer.style.display = 'flex';
        if (resultActions) resultActions.style.display = 'flex';
    }

    // Download generated image
    function downloadImage() {
        if (!window.generatedImage) {
            alert('No generated image to download.');
            return;
        }

        // 显示下载中提示
        const originalText = downloadBtn.innerHTML;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
        
        // 尝试直接下载，如果失败则使用代理
        fetch(window.generatedImage)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch image');
                }
                return response.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'ai-doll-' + new Date().getTime() + '.jpg';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                downloadBtn.innerHTML = originalText;
            })
            .catch(() => {
                console.log('直接下载失败，尝试使用代理');
                // 使用代理下载
                const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(window.generatedImage)}`;
                fetch(proxyUrl)
                    .then(response => response.blob())
                    .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = 'ai-doll-' + new Date().getTime() + '.jpg';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                        downloadBtn.innerHTML = originalText;
                    })
                    .catch(error => {
                        console.error('代理下载也失败:', error);
                        alert('Failed to download image.');
                        downloadBtn.innerHTML = originalText;
                    });
            });
    }

    // 添加提示词建议功能
    const suggestionTags = document.querySelectorAll('.suggestion-tag');

    if (suggestionTags.length > 0 && promptInput) {
        suggestionTags.forEach(tag => {
            tag.addEventListener('click', () => {
                const tagText = tag.textContent.trim();
                const currentText = promptInput.value.trim();

                if (currentText) {
                    promptInput.value = currentText + ', ' + tagText;
                } else {
                    promptInput.value = tagText;
                }

                promptInput.focus();
            });
        });
    }
});
