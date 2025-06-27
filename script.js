import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

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
    messagesDiv.textContent = 'Loading FFmpeg...';
    messagesDiv.style.display = 'block';
    if (ffmpeg) {
        return; // Already loaded
    }
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
        messagesDiv.textContent = message;
        // console.log(message); // For debugging
    });
    ffmpeg.on('progress', ({ progress, time }) => {
        progressBar.style.width = `${progress * 100}%`;
        progressBar.textContent = `${(progress * 100).toFixed(0)}%`;
        if (progressBarContainer.style.display === 'none') {
            progressBarContainer.style.display = 'block';
        }
    });

    try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'; // Use a CDN for simplicity
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
        });
        messagesDiv.textContent = 'FFmpeg loaded successfully!';
        setTimeout(() => messagesDiv.style.display = 'none', 3000); // Hide after a few seconds
    } catch (error) {
        messagesDiv.textContent = `Error loading FFmpeg: ${error.message}`;
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

    if (!ffmpeg) {
        messagesDiv.textContent = 'FFmpeg is still loading. Please wait.';
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

        // Extract frames
        const frameOutputPattern = 'frame_%04d.png'; // e.g., frame_0001.png
        await ffmpeg.exec(['-i', inputFileName, frameOutputPattern]);

        // Extract audio
        const audioFileName = 'extracted_audio.mp3';
        await ffmpeg.exec(['-i', inputFileName, '-vn', audioFileName]); // -vn means no video

        // Read frames and display/download
        const files = await ffmpeg.listDir('.');
        const frameFiles = files.filter(file => file.name.startsWith('frame_') && file.name.endsWith('.png'));

        for (const fileInfo of frameFiles) {
            const frameData = await ffmpeg.readFile(fileInfo.name);
            const frameBlob = new Blob([frameData.buffer], { type: 'image/png' });
            const frameUrl = URL.createObjectURL(frameBlob);

            const img = document.createElement('img');
            img.src = frameUrl;
            img.style.maxWidth = '100px';
            img.style.margin = '5px';
            framesOutput.appendChild(img);

            const downloadLink = document.createElement('a');
            downloadLink.href = frameUrl;
            downloadLink.download = fileInfo.name;
            downloadLink.textContent = `Download ${fileInfo.name}`;
            framesOutput.appendChild(downloadLink);
            framesOutput.appendChild(document.createElement('br'));
        }

        // Read audio and provide download
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
        audioDownloadLink.textContent = `Download ${audioFileName}`;
        audioOutput.appendChild(audioDownloadLink);

        messagesDiv.textContent = 'Video converted to frames and audio extracted!';
    } catch (error) {
        messagesDiv.textContent = `Error processing video: ${error.message}`;
        console.error('Error in video to frames:', error);
    } finally {
        progressBarContainer.style.display = 'none';
        // Clean up FFmpeg's file system (optional, but good practice for large files)
        // await ffmpeg.rm(inputFileName);
        // for (const fileInfo of frameFiles) { await ffmpeg.rm(fileInfo.name); }
        // await ffmpeg.rm(audioFileName);
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
    if (!ffmpeg) {
        messagesDiv.textContent = 'FFmpeg is still loading. Please wait.';
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
        // Sort frames by name to ensure correct order (e.g., frame_0001.png, frame_0002.png)
        const sortedFrameFiles = Array.from(frameFiles).sort((a, b) => {
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Write frames to FFmpeg's file system
        for (let i = 0; i < sortedFrameFiles.length; i++) {
            const file = sortedFrameFiles[i];
            const data = await readFileAsUint8Array(file);
            // Ensure consistent naming for FFmpeg to read as a sequence
            await ffmpeg.writeFile(`input_frame_${String(i).padStart(4, '0')}.${file.name.split('.').pop()}`, data);
        }

        const outputVideoName = 'output.mp4';
        let ffmpegVideoCommand = [
            '-framerate', framerate.toString(),
            '-i', `input_frame_%04d.${sortedFrameFiles[0].name.split('.').pop()}`, // Use the extension of the first frame
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p', // Important for browser compatibility
            outputVideoName
        ];

        let finalOutputFileName = outputVideoName;

        if (audioFile) {
            messagesDiv.textContent = 'Converting frames to video and adding audio...';
            const audioInputFileName = audioFile.name;
            const audioData = await readFileAsUint8Array(audioFile);
            await ffmpeg.writeFile(audioInputFileName, audioData);

            const tempVideoName = 'temp_video.mp4';
            await ffmpeg.exec(ffmpegVideoCommand.slice(0, ffmpegVideoCommand.length - 1).concat([tempVideoName])); // Create video without audio first

            finalOutputFileName = 'final_video_with_audio.mp4';
            await ffmpeg.exec([
                '-i', tempVideoName,
                '-i', audioInputFileName,
                '-c:v', 'copy',
                '-c:a', 'aac', // or libmp3lame if you want mp3 audio
                '-map', '0:v:0', // Map video stream from first input
                '-map', '1:a:0', // Map audio stream from second input
                '-shortest', // End video when shortest stream ends (prevents silent gaps)
                finalOutputFileName
            ]);
            await ffmpeg.rm(tempVideoName); // Clean up temporary video
        } else {
            // No audio file, just create the video from frames
            await ffmpeg.exec(ffmpegVideoCommand);
        }

        // Read output video and provide download
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
        messagesDiv.textContent = `Error processing frames to video: ${error.message}`;
        console.error('Error in frames to video:', error);
    } finally {
        progressBarContainer.style.display = 'none';
        // Clean up FFmpeg's file system
        // for (let i = 0; i < sortedFrameFiles.length; i++) {
        //     await ffmpeg.rm(`input_frame_${String(i).padStart(4, '0')}.${sortedFrameFiles[0].name.split('.').pop()}`);
        // }
        // if (audioFile) { await ffmpeg.rm(audioFile.name); }
        // await ffmpeg.rm(finalOutputFileName);
    }
});