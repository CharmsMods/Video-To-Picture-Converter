const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({
    log: true, // Enable logging for debugging
    corePath: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js', // Or specify a local path if self-hosting
});

// UI Elements
const videoInput = document.getElementById('videoInput');
const extractBtn = document.getElementById('extractBtn');
const extractProgress = document.getElementById('extractProgress');
const framesContainer = document.getElementById('framesContainer');
const audioOutput = document.getElementById('audioOutput');

const framesInput = document.getElementById('framesInput');
const audioTrackInput = document.getElementById('audioTrackInput');
const framerateInput = document.getElementById('framerate');
const createVideoBtn = document.getElementById('createVideoBtn');
const createProgress = document.getElementById('createProgress');
const videoOutput = document.getElementById('videoOutput');
const downloadVideoBtn = document.getElementById('downloadVideoBtn');

const loadingOverlay = document.getElementById('loadingOverlay');

let selectedVideoFile = null;
let selectedFrames = [];
let selectedAudioTrack = null;

// --- Initialization ---
async function loadFFmpeg() {
    try {
        if (!ffmpeg.isLoaded()) {
            loadingOverlay.style.display = 'flex';
            ffmpeg.setProgress(({ ratio }) => {
                loadingOverlay.querySelector('p').textContent = `Loading FFmpeg.wasm: ${Math.round(ratio * 100)}%`;
            });
            await ffmpeg.load();
            loadingOverlay.style.display = 'none';
            console.log('FFmpeg.wasm loaded successfully!');
            enableButtons();
        }
    } catch (error) {
        console.error('Failed to load FFmpeg.wasm:', error);
        loadingOverlay.style.display = 'none';
        alert('Failed to load FFmpeg.wasm. Please check your internet connection and try again.');
    }
}

function enableButtons() {
    if (selectedVideoFile) {
        extractBtn.disabled = false;
    }
    if (selectedFrames.length > 0 && selectedAudioTrack) {
        createVideoBtn.disabled = false;
    }
}

// --- Event Listeners ---
videoInput.addEventListener('change', (event) => {
    selectedVideoFile = event.target.files[0];
    if (selectedVideoFile) {
        extractBtn.disabled = false;
    } else {
        extractBtn.disabled = true;
    }
    framesContainer.innerHTML = '';
    audioOutput.src = '';
});

framesInput.addEventListener('change', (event) => {
    selectedFrames = Array.from(event.target.files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); // Sort frames numerically
    checkCreateVideoConditions();
});

audioTrackInput.addEventListener('change', (event) => {
    selectedAudioTrack = event.target.files[0];
    checkCreateVideoConditions();
});

framerateInput.addEventListener('input', checkCreateVideoConditions);

extractBtn.addEventListener('click', extractFramesAndAudio);
createVideoBtn.addEventListener('click', createVideoFromFramesAndAudio);

// --- Helper to check conditions for enabling create video button ---
function checkCreateVideoConditions() {
    if (selectedFrames.length > 0 && selectedAudioTrack && framerateInput.value >= 1) {
        createVideoBtn.disabled = false;
    } else {
        createVideoBtn.disabled = true;
    }
}

// --- Functions ---

async function extractFramesAndAudio() {
    if (!selectedVideoFile) {
        alert('Please select a video file.');
        return;
    }

    extractBtn.disabled = true;
    extractProgress.textContent = 'Processing... This may take a while.';
    framesContainer.innerHTML = '';
    audioOutput.src = '';

    const inputFileName = 'input.mp4'; // Use a generic name for the FFmpeg filesystem
    const audioFileName = 'output.mp3';

    try {
        // Write the input video to FFmpeg's virtual file system
        ffmpeg.FS('writeFile', inputFileName, await fetchFile(selectedVideoFile));

        // 1. Extract audio
        extractProgress.textContent = 'Extracting audio...';
        await ffmpeg.run('-i', inputFileName, '-q:a', '0', '-map', 'a', audioFileName); // -q:a 0 for highest quality audio

        const audioData = ffmpeg.FS('readFile', audioFileName);
        const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' }); // Assuming MP3, adjust if needed
        audioOutput.src = URL.createObjectURL(audioBlob);

        // 2. Extract frames
        extractProgress.textContent = 'Extracting frames...';
        // -r 1: extract 1 frame per second (adjust as needed for higher density)
        // %0d.png: output format for numbered PNG images (e.g., 1.png, 2.png)
        await ffmpeg.run('-i', inputFileName, '-vf', 'fps=10', 'frame_%04d.png'); // Example: 10 frames per second, padded to 4 digits

        const extractedFrameNames = ffmpeg.FS('readdir', '/').filter(name => name.startsWith('frame_') && name.endsWith('.png'));
        extractedFrameNames.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        extractProgress.textContent = `Displaying ${extractedFrameNames.length} frames...`;

        for (const frameName of extractedFrameNames) {
            const frameData = ffmpeg.FS('readFile', frameName);
            const frameBlob = new Blob([frameData.buffer], { type: 'image/png' });
            const img = document.createElement('img');
            img.src = URL.createObjectURL(frameBlob);
            img.alt = frameName;
            framesContainer.appendChild(img);
            URL.revokeObjectURL(frameBlob); // Clean up
            ffmpeg.FS('unlink', frameName); // Delete from FFmpeg FS
        }

        // Clean up video file from FFmpeg's file system
        ffmpeg.FS('unlink', inputFileName);

        extractProgress.textContent = 'Extraction complete!';
        alert('Frames and audio extracted successfully!');

    } catch (error) {
        console.error('Error during extraction:', error);
        extractProgress.textContent = `Error: ${error.message}`;
        alert('Error during extraction. Check console for details.');
    } finally {
        extractBtn.disabled = false;
    }
}

async function createVideoFromFramesAndAudio() {
    if (selectedFrames.length === 0) {
        alert('Please select frames to create a video.');
        return;
    }
    if (!selectedAudioTrack) {
        alert('Please select an audio track.');
        return;
    }
    const framerate = parseInt(framerateInput.value);
    if (isNaN(framerate) || framerate < 1) {
        alert('Please enter a valid framerate (e.g., 25).');
        return;
    }

    createVideoBtn.disabled = true;
    createProgress.textContent = 'Processing... This may take a while.';
    videoOutput.src = '';
    downloadVideoBtn.style.display = 'none';

    try {
        // Write frames to FFmpeg's virtual file system
        createProgress.textContent = 'Writing frames to FFmpeg FS...';
        for (let i = 0; i < selectedFrames.length; i++) {
            const frameFile = selectedFrames[i];
            const paddedIndex = String(i + 1).padStart(4, '0'); // Match frame_0001.png format
            const outputFrameName = `frame_${paddedIndex}.png`;
            ffmpeg.FS('writeFile', outputFrameName, await fetchFile(frameFile));
        }

        // Write audio track to FFmpeg's virtual file system
        createProgress.textContent = 'Writing audio to FFmpeg FS...';
        const audioInputFileName = 'audio_track.mp3'; // Or .wav, based on input
        ffmpeg.FS('writeFile', audioInputFileName, await fetchFile(selectedAudioTrack));

        const outputVideoFileName = 'output.mp4';

        // FFmpeg command to combine images and audio into a video
        // -framerate: input framerate for images
        // -i frame_%04d.png: input image sequence
        // -i audio_track.mp3: input audio track
        // -c:v libx264: video codec (H.264 is widely supported)
        // -pix_fmt yuv420p: pixel format for compatibility
        // -shortest: end video when shortest input stream ends (important for audio length)
        createProgress.textContent = 'Combining frames and audio...';
        await ffmpeg.run(
            '-framerate', framerate.toString(),
            '-i', 'frame_%04d.png',
            '-i', audioInputFileName,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-shortest', // Stop encoding when the shortest stream (audio or video) ends
            outputVideoFileName
        );

        // Read the output video
        const videoData = ffmpeg.FS('readFile', outputVideoFileName);
        const videoBlob = new Blob([videoData.buffer], { type: 'video/mp4' });
        videoOutput.src = URL.createObjectURL(videoBlob);
        downloadVideoBtn.href = URL.createObjectURL(videoBlob);
        downloadVideoBtn.style.display = 'block';

        // Clean up temporary files from FFmpeg's file system
        for (let i = 0; i < selectedFrames.length; i++) {
            const paddedIndex = String(i + 1).padStart(4, '0');
            ffmpeg.FS('unlink', `frame_${paddedIndex}.png`);
        }
        ffmpeg.FS('unlink', audioInputFileName);
        ffmpeg.FS('unlink', outputVideoFileName);


        createProgress.textContent = 'Video creation complete!';
        alert('Video created successfully!');

    } catch (error) {
        console.error('Error during video creation:', error);
        createProgress.textContent = `Error: ${error.message}`;
        alert('Error during video creation. Check console for details.');
    } finally {
        createVideoBtn.disabled = false;
    }
}

// Load FFmpeg.wasm when the page loads
loadFFmpeg();

// Initial check for button states
checkCreateVideoConditions();