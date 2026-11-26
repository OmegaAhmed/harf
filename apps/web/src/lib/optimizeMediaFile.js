const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const AUDIO_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_WIDTH = 1280;
const MAX_VIDEO_HEIGHT = 720;
const AUDIO_RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm'];
const VIDEO_RECORDER_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

function findSupportedRecorderType(types, kind) {
  if (typeof MediaRecorder === 'undefined') return null;
  return types.find((type) => MediaRecorder.isTypeSupported(type) && canPlayRecordedType(type, kind)) ?? null;
}

function canPlayRecordedType(type, kind) {
  return document.createElement(kind).canPlayType(type) !== '';
}

async function validatePlayableOutput(blob, kind, expectedDuration) {
  const media = document.createElement(kind);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const metadataReady = new Promise((resolve, reject) => {
      media.addEventListener('loadedmetadata', resolve, { once: true });
      media.addEventListener('error', () => reject(new Error('The recorded media cannot be decoded.')), { once: true });
    });
    media.src = objectUrl;
    media.load();
    await metadataReady;
    const durationTolerance = Math.max(0.25, expectedDuration * 0.1);
    if (!Number.isFinite(media.duration) || Math.abs(media.duration - expectedDuration) > durationTolerance) {
      throw new Error('The recorded media duration does not match the source.');
    }
    if (kind === 'video' && (!media.videoWidth || !media.videoHeight)) {
      throw new Error('The recorded video has no decodable frames.');
    }
  } finally {
    media.pause();
    media.removeAttribute('src');
    media.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function recordStream(stream, options, startRecording) {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream, options);
    const chunks = [];
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      if (recorder.state !== 'inactive') recorder.stop();
      reject(error);
    };

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = (event) => fail(event.error ?? new Error('Media recording failed.'));
    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      const mimeType = recorder.mimeType.split(';', 1)[0];
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) {
        reject(new Error('Media recording produced no output.'));
        return;
      }
      resolve(blob);
    };

    try {
      Promise.resolve(startRecording(recorder)).catch(fail);
    } catch (error) {
      fail(error);
    }
  });
}

function createOptimizedFile(blob, sourceFile) {
  return new File([blob], `${sourceFile.name.replace(/\.[^.]+$/, '') || 'media'}.webm`, {
    type: blob.type,
    lastModified: sourceFile.lastModified
  });
}

function useCompressedOrOriginal(blob, sourceFile, maximumSize) {
  if (blob.size >= sourceFile.size && sourceFile.size <= maximumSize) return sourceFile;
  if (blob.size > maximumSize) {
    throw new Error('تعذر ضغط الملف إلى ما دون الحد المسموح. اختر ملفًا أقصر أو أصغر.');
  }
  return createOptimizedFile(blob, sourceFile);
}

function unchangedOrTooLarge(file, maximumSize) {
  if (file.size <= maximumSize) return file;
  throw new Error('هذا المتصفح لا يدعم ضغط هذا الملف. استخدم متصفحًا أحدث أو ملفًا أصغر.');
}

async function optimizeAudioFile(file) {
  if (file.size > AUDIO_SOURCE_MAX_BYTES) {
    throw new Error('حجم ملف الصوت الأصلي يتجاوز 25 ميجابايت. اختر ملفًا أصغر.');
  }
  if (file.size <= AUDIO_MAX_BYTES) return file;
  const mimeType = findSupportedRecorderType(AUDIO_RECORDER_TYPES, 'audio');
  const AudioContextConstructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!mimeType || !AudioContextConstructor) {
    return unchangedOrTooLarge(file, AUDIO_MAX_BYTES);
  }

  const audio = document.createElement('audio');
  audio.preload = 'auto';
  const sourceUrl = URL.createObjectURL(file);
  const audioContext = new AudioContextConstructor();
  let audioSource;
  let destination;
  try {
    const resumePromise = audioContext.resume();
    audioSource = audioContext.createMediaElementSource(audio);
    destination = audioContext.createMediaStreamDestination();
    audioSource.connect(destination);
    const metadataReady = waitForMediaEvent(audio, 'loadedmetadata');
    audio.src = sourceUrl;
    audio.load();
    await metadataReady;
    await resumePromise;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      throw new Error('Audio metadata is invalid.');
    }

    const blob = await recordStream(destination.stream, {
      mimeType,
      audioBitsPerSecond: 96_000
    }, async (recorder) => {
      recorder.start(1000);
      const audioEnded = waitForMediaEvent(audio, 'ended');
      await audio.play();
      await audioEnded;
      if (recorder.state !== 'inactive') recorder.stop();
    });
    await validatePlayableOutput(blob, 'audio', audio.duration);
    return useCompressedOrOriginal(blob, file, AUDIO_MAX_BYTES);
  } catch (error) {
    if (file.size <= AUDIO_MAX_BYTES) return file;
    throw new Error('تعذر ضغط الصوت. اختر ملفًا أصغر أو متصفحًا يدعم WebM/Opus.', { cause: error });
  } finally {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(sourceUrl);
    destination?.stream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
  }
}

function waitForMediaEvent(element, successEvent) {
  return new Promise((resolve, reject) => {
    element.addEventListener(successEvent, resolve, { once: true });
    element.addEventListener('error', () => reject(new Error('تعذر قراءة ملف الفيديو.')), { once: true });
  });
}

async function optimizeVideoFile(file) {
  if (file.size > VIDEO_SOURCE_MAX_BYTES) {
    throw new Error('حجم ملف الفيديو الأصلي يتجاوز 50 ميجابايت. اختر ملفًا أقصر أو أصغر.');
  }
  if (file.size <= VIDEO_MAX_BYTES) return file;
  const mimeType = findSupportedRecorderType(VIDEO_RECORDER_TYPES, 'video');
  const AudioContextConstructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!mimeType || !AudioContextConstructor) {
    return unchangedOrTooLarge(file, VIDEO_MAX_BYTES);
  }

  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  const sourceUrl = URL.createObjectURL(file);
  let audioContext;
  let audioDestination;
  let stream;
  let animationFrame = 0;

  try {
    audioContext = new AudioContextConstructor();
    const resumePromise = audioContext.resume();
    const audioSource = audioContext.createMediaElementSource(video);
    audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);

    const metadataReady = waitForMediaEvent(video, 'loadedmetadata');
    video.src = sourceUrl;
    video.load();
    await metadataReady;
    await resumePromise;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error('Video metadata is invalid.');
    }

    const scale = Math.min(1, MAX_VIDEO_WIDTH / video.videoWidth, MAX_VIDEO_HEIGHT / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context || typeof canvas.captureStream !== 'function') {
      return unchangedOrTooLarge(file, VIDEO_MAX_BYTES);
    }

    stream = canvas.captureStream(24);
    for (const track of audioDestination.stream.getAudioTracks()) stream.addTrack(track);
    const blob = await recordStream(stream, {
      mimeType,
      videoBitsPerSecond: 1_500_000,
      audioBitsPerSecond: 96_000
    }, async (recorder) => {
      recorder.start(1000);
      const drawFrame = () => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        if (!video.ended && recorder.state === 'recording') {
          animationFrame = requestAnimationFrame(drawFrame);
        }
      };
      drawFrame();
      const videoEnded = waitForMediaEvent(video, 'ended');
      await video.play();
      await videoEnded;
      if (recorder.state !== 'inactive') recorder.stop();
    });
    await validatePlayableOutput(blob, 'video', video.duration);
    return useCompressedOrOriginal(blob, file, VIDEO_MAX_BYTES);
  } catch (error) {
    if (file.size <= VIDEO_MAX_BYTES) return file;
    throw new Error('تعذر ضغط الفيديو. اختر ملفًا أصغر أو متصفحًا يدعم WebM.', { cause: error });
  } finally {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(sourceUrl);
    stream?.getTracks().forEach((track) => track.stop());
    audioDestination?.stream.getTracks().forEach((track) => track.stop());
    if (audioContext) await audioContext.close();
  }
}

export async function optimizeMediaFile(file, kind) {
  if (kind === 'audio' && file.type.startsWith('audio/')) return optimizeAudioFile(file);
  if (kind === 'video' && file.type.startsWith('video/')) return optimizeVideoFile(file);
  return file;
}
