import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { RecordedAudio } from './api/voiceCommands';

type Recorder = {
  isRecording: boolean;
  uri: string | null;
  getStatus(): {
    durationMillis: number;
    fileSize: number;
    url?: string | null;
  };
  stop(): Promise<void>;
};
// Android resets the duration on stop; keep the last live status and the finalized file.
export async function finishRecording(
  recorder: Recorder,
  lastDurationMillis = 0,
): Promise<RecordedAudio> {
  const before = recorder.getStatus();
  const originalUri = recorder.uri ?? before.url;
  if (recorder.isRecording) await recorder.stop();
  const after = recorder.getStatus();
  const uri = recorder.uri ?? after.url ?? originalUri;
  if (!uri) throw new Error('녹음 파일을 찾지 못했어요. 다시 녹음해주세요.');
  const durationMillis = Math.max(
    lastDurationMillis,
    before.durationMillis || 0,
    after.durationMillis || 0,
  );
  const fileSize = Platform.OS === 'web' ? after.fileSize : new File(uri).size;
  return { uri, durationMillis, fileSize };
}
