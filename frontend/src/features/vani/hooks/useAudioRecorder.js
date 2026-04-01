import { useRef, useState, useCallback } from 'react';

export const useAudioRecorder = () => {
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const streamRef        = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError]             = useState(null);

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(100);
      setIsRecording(true);
      return true;
    } catch (err) {
      const msg = err.name === 'NotAllowedError' ? 'Mic access denied. Use text input below.' :
                  err.name === 'NotFoundError'   ? 'No microphone found.' : 'Could not start recording.';
      setError(msg);
      return false;
    }
  }, []);

  const stop = useCallback(() => new Promise((resolve) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') { resolve(null); return; }
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || 'audio/webm';
      const blob     = new Blob(chunksRef.current, { type: mimeType });
      streamRef.current?.getTracks().forEach(t => t.stop());
      setIsRecording(false);
      resolve({ blob, mimeType });
    };
    recorder.stop();
  }), []);

  const cancel = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    chunksRef.current = [];
    setIsRecording(false);
  }, []);

  return { start, stop, cancel, isRecording, error };
};