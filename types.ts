export interface BookConfig {
  childName: string;
  theme: string;
  pageCount: number;
  aspectRatio: string;
  imageSize: '1K' | '2K' | '4K';
  artStyle: string;
  ageGroup: 'toddler' | 'kids' | 'expert';
}

export interface GeneratedPage {
  id: string;
  sceneDescription: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface SavedProject {
  id: string;
  timestamp: number;
  config: BookConfig;
  pages: GeneratedPage[];
}

export enum AppState {
  SETUP = 'SETUP',
  GENERATING_STORY = 'GENERATING_STORY',
  GENERATING_IMAGES = 'GENERATING_IMAGES',
  COMPLETED = 'COMPLETED'
}