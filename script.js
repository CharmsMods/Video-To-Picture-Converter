// *** CRITICAL CHANGE: Import FFmpeg and toBlobURL from jsDelivr as well ***
import { FFmpeg } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/dist/esm/index.js';
import { toBlobURL } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js';

const videoToFramesInput = document.getElementById('videoToFramesInput');
const convertVideoToFramesBtn = document.getElementById('convertVideoToFramesBtn');
const framesOutput = document.getElementById('framesOutput');
const audioOutput = document.getElementById('audioOutput');

const framesToVideoInput = document.getElementById('framesToVideoInput');
const audioTrackInput = document.getElementById('audioTrackInput');
const framerateInput = document.getElementById('framerateInput');
const convertFramesToVideoBtn = document.getElementById('convertFramesToVideoBtn');
const videoOutput = document.getElementById('videoOutput');

const messagesDiv = document.getElementById('messages');
const progressBarContainer = document.getElementById('progressBarContainer');
const progressBar = document.getElementById('progressBar');

let ffmpeg = null;

const loadFFmpeg = async () => {
    messagesDiv.textContent = 'Loading FFmpeg... This might take a moment.';
    messagesDiv.style.display = 'block';
    if (ffmpeg) {
        messagesDiv.textContent = 'FFmpeg already loaded.';
        setTimeout(() => messagesDiv.style.display = 'none', 3000);
        return; // Already loaded
    }
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
        if (message.includes('loading') || message.includes('complete')) {
            messagesDiv.textContent = message;
        }
        console.log(message);
    });
    ffmpeg.on('progress', ({ progress, time }) => {
        progressBar.style.width = `${progress * 100}%`;
        progressBar.textContent = `${(progress * 100).toFixed(0)}%`;
        if (progressBarContainer.style.display === 'none') {
            progressBarContainer.style.display = 'block';
        }
    });

    try {
        // All core files are now fetched from jsDelivr, ensuring consistency
        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });

        messagesDiv.textContent = 'FFmpeg loaded successfully!';
        setTimeout(() => messagesDiv.style.display = 'none', 3000);
    } catch (error) {
        messagesDiv.textContent = `Error loading FFmpeg: ${error.message}. Check console for details.`;
        console.error('Error loading FFmpeg:', error);
    }
};

// Load FFmpeg as soon as the script loads
loadFFmpeg();

const readFileAsUint8Array = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            resolve(new Uint8Array(event.target.result));
        };
        reader.onerror = (error) => {
            reject(error);
        };
        reader.readAsArrayBuffer(file);
    });
};

// --- Video to Frames Functionality ---
convertVideoToFramesBtn.addEventListener('click', async () => {
    const videoFile = videoToFramesInput.files[0];
    if (!videoFile) {
        messagesDiv.textContent = 'Please select a video file.';
        messagesDiv.style.display = 'block';
        return;
    }

    if (!ffmpeg || !ffmpeg.loaded) {
        messagesDiv.textContent = 'FFmpeg is still loading or failed to load. Please wait or refresh.';
        messagesDiv.style.display = 'block';
        return;
    }

    messagesDiv.textContent = 'Converting video to frames and extracting audio...';
    messagesDiv.style.display = 'block';
    progressBarContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    framesOutput.innerHTML = '';
    audioOutput.innerHTML = '';

    try {
        const inputFileName = videoFile.name;
        const videoData = await readFileAsUint8Array(videoFile);
        await ffmpeg.writeFile(inputFileName, videoData);

        const frameOutputPattern = 'frame_%04d.png';
        await ffmpeg.exec(['-i', inputFileName, frameOutputPattern]);

        const audioFileName = 'extracted_audio.mp3';
        await ffmpeg.exec(['-i', inputFileName, '-vn', '-q:a', '0', audioFileName]);

        const files = await ffmpeg.listDir('.');
        const frameFiles = files.filter(file => file.name.startsWith('frame_') && file.name.endsWith('.png'));

        if (frameFiles.length === 0) {
            messagesDiv.textContent = 'No frames were extracted. Check video format or console for errors.';
            console.warn('No frame files found after extraction.');
        } else {
            for (const fileInfo of frameFiles) {
                const frameData = await ffmpeg.readFile(fileInfo.name);
                const frameBlob = new Blob([frameData.buffer], { type: 'image/png' });
                const frameUrl = URL.createObjectURL(frameBlob);

                const img = document.createElement('img');
                img.src = frameUrl;
                img.alt = fileInfo.name;
                img.style.maxWidth = '100px';
                img.style.maxHeight = '100px';
                img.style.margin = '5px';
                img.style.border = '1px solid #ddd';
                framesOutput.appendChild(img);

                const downloadLink = document.createElement('a');
                downloadLink.href = frameUrl;
                downloadLink.download = fileInfo.name;
                downloadLink.textContent = `Download ${fileInfo.name}`;
                downloadLink.style.margin = '0 5px 10px 5px';
                downloadLink.style.display = 'inline-block';
                framesOutput.appendChild(downloadLink);
            }
        }

        const audioData = await ffmpeg.readFile(audioFileName);
        const audioBlob = new Blob([audioData.buffer], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);

        const audioEl = document.createElement('audio');
        audioEl.controls = true;
        audioEl.src = audioUrl;
        audioOutput.appendChild(audioEl);

        const audioDownloadLink = document.createElement('a');
        audioDownloadLink.href = audioUrl;
        audioDownloadLink.download = audioFileName;
        audioOutput.appendChild(audioDownloadLink);

        messagesDiv.textContent = 'Video converted to frames and audio extracted!';
    } catch (error) {
        messagesDiv.textContent = `Error processing video: ${error.message}. Check console for details.`;
        console.error('Error in video to frames:', error);
    } finally {
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        try {
            await ffmpeg.rm(inputFileName);
            const filesToRemove = (await ffmpeg.listDir('.')).filter(file => file.name.startsWith('frame_') || file.name === 'extracted_audio.mp3');
            for (const fileInfo of filesToRemove) {
                await ffmpeg.rm(fileInfo.name);
            }
        } catch (cleanupError) {
            console.error('Error during FFmpeg file system cleanup:', cleanupError);
        }
    }
});

// --- Frames to Video Functionality ---
convertFramesToVideoBtn.addEventListener('click', async () => {
    const frameFiles = framesToVideoInput.files;
    const audioFile = audioTrackInput.files[0];
    const framerate = parseInt(framerateInput.value, 10);

    if (frameFiles.length === 0) {
        messagesDiv.textContent = 'Please select image frames.';
        messagesDiv.style.display = 'block';
        return;
    }
    if (isNaN(framerate) || framerate <= 0) {
        messagesDiv.textContent = 'Please enter a valid framerate (e.g., 25).';
        messagesDiv.style.display = 'block';
        return;
    }
    if (!ffmpeg || !ffmpeg.loaded) {
        messagesDiv.textContent = 'FFmpeg is still loading or failed to load. Please wait or refresh.';
        messagesDiv.style.display = 'block';
        return;
    }

    messagesDiv.textContent = 'Converting frames to video...';
    messagesDiv.style.display = 'block';
    progressBarContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    videoOutput.innerHTML = '';

    try {
        const sortedFrameFiles = Array.from(frameFiles).sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        const firstFrameExtension = sortedFrameFiles[0].name.split('.').pop();
        if (!firstFrameExtension) {
            throw new Error('Could not determine file extension for frames.');
        }

        for (let i = 0; i < sortedFrameFiles.length; i++) {
            const file = sortedFrameFiles[i];
            const data = await readFileAsUint8Array(file);
            const paddedIndex = String(i).padStart(4, '0');
            await ffmpeg.writeFile(`input_frame_${paddedIndex}.${firstFrameExtension}`, data);
        }

        const outputVideoName = 'output.mp4';
        let ffmpegVideoCommand = [
            '-framerate', framerate.toString(),
            '-i', `input_frame_%04d.${firstFrameExtension}`,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            outputVideoName
        ];

        let finalOutputFileName = outputVideoName;

        if (audioFile) {
            messagesDiv.textContent = 'Converting frames to video and adding audio...';
            const audioInputFileName = audioFile.name;
            const audioData = await readFileAsUint8Array(audioFile);
            await ffmpeg.writeFile(audioInputFileName, audioData);

            const tempVideoName = 'temp_video.mp4';
            await ffmpeg.exec(ffmpegVideoCommand.slice(0, ffmpegVideoCommand.length - 1).concat([tempVideoName]));

            finalOutputFileName = 'final_video_with_audio.mp4';
            await ffmpeg.exec([
                '-i', tempVideoName,
                '-i', audioInputFileName,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-shortest',
                finalOutputFileName
            ]);
            await ffmpeg.rm(tempVideoName);
        } else {
            await ffmpeg.exec(ffmpegVideoCommand);
        }

        const outputVideoData = await ffmpeg.readFile(finalOutputFileName);
        const videoBlob = new Blob([outputVideoData.buffer], { type: 'video/mp4' });
        const videoUrl = URL.createObjectURL(videoBlob);

        const videoEl = document.createElement('video');
        videoEl.controls = true;
        videoEl.src = videoUrl;
        videoEl.style.maxWidth = '100%';
        videoOutput.appendChild(videoEl);

        const downloadLink = document.createElement('a');
        downloadLink.href = videoUrl;
        downloadLink.download = finalOutputFileName;
        downloadLink.textContent = `Download ${finalOutputFileName}`;
        videoOutput.appendChild(downloadLink);

        messagesDiv.textContent = 'Video created successfully!';
    } catch (error) {
        messagesDiv.textContent = `Error processing frames to video: ${error.message}. Check console for details.`;
        console.error('Error in frames to video:', error);
    } finally {
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        try {
            const filesToRemove = (await ffmpeg.listDir('.')).filter(file => file.name.startsWith('input_frame_') || file.name === audioFile?.name);
            for (const fileInfo of filesToRemove) {
                await ffmpeg.rm(fileInfo.name);
            }
        } catch (cleanupError) {
            console.error('Error during FFmpeg file system cleanup:', cleanupError);
        }
    }
});