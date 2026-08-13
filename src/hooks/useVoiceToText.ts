import { useState, useRef } from 'react';
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

// The server allowlists what it will transcribe; ask MediaRecorder for the
// first container it can actually produce from that list rather than assuming
// webm. Safari records audio/mp4 — assuming webm sends a mislabelled payload
// the server rejects.
const PREFERRED_MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"];

function pickSupportedMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useVoiceToText({ onTranscribe }: { onTranscribe: (text: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  // A capture or transcription failure, surfaced as state instead of a silent
  // console line; cleared on the next successful start.
  const [captureError, setCaptureError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");

  const transcribeAudio = useAction(api.ai.transcribeAudio);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const preferredType = pickSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mimeTypeRef.current = mediaRecorder.mimeType || preferredType || "audio/webm";

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Build the raw binary audio blob natively from memory
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });

        // Disconnect immediately to remove the OS red-recording-dot and save battery
        stream.getTracks().forEach(track => track.stop());

        // Parse to Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
           const base64String = reader.result as string;

           // Ensure cleanly separated base64 without the "data:audio/webm;base64," prefix.
           const base64data = base64String.substring(base64String.indexOf(',') + 1);

           setIsTranscribing(true);
           try {
             const resultText = await transcribeAudio({
                audioBase64: base64data,
                mimeType: mimeTypeRef.current
             });
             if (resultText && resultText.trim().length > 0) {
                onTranscribe(resultText.trim() + " ");
             }
           } catch (error) {
             console.error("Transcription failed:", error);
             setCaptureError("transcription");
           } finally {
             setIsTranscribing(false);
           }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setPermissionError(false);
      setCaptureError(null);
    } catch (error) {
       console.error("Microphone access was blocked by the browser.", error);
       setPermissionError(true);
       setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
       stopRecording();
    } else {
       startRecording();
    }
  };

  return {
    isRecording,
    isTranscribing,
    toggleRecording,
    startRecording,
    stopRecording,
    captureError,
    permissionError,
    setPermissionError,
  };
}
