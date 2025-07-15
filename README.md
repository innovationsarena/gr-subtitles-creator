# MP4 Transcriber

A simple Node.js application that transcribes MP4 video files using OpenAI's Whisper API.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file from the template:
   ```bash
   cp .env.example .env
   ```

3. Add your OpenAI API key to the `.env` file:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

## Usage

Point the application to a folder containing MP4 files:

```bash
node transcribe.js path/to/your/video/folder
```

or

```bash
npm start path/to/your/video/folder
```

## Features

- Batch processes all MP4 files in a folder
- Transcribes MP4 video files using OpenAI Whisper
- Converts MP4 to 128kbps MP3 before processing (reduces file size and API costs)
- Progress bar showing processing stages for each file
- Generates SRT subtitle files with timestamps
- Saves SRT files in the same folder as the movie files
- Skips files that already have SRT subtitles
- Error handling for missing files and invalid formats
- Command-line interface

## Requirements

- Node.js
- FFmpeg installed on your system

## Output

The application will:
- Scan the folder for all MP4 files
- Show a progress bar during processing for each file
- Save SRT subtitle files in the same folder as the movie files
- Skip files that already have corresponding SRT files
- Display processing status and completion summary