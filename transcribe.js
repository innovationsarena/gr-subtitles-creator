require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const cliProgress = require("cli-progress");
const ffmpeg = require("fluent-ffmpeg");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libmp3lame")
      .audioBitrate(128)
      .format("mp3")
      .on("end", () => {
        resolve(outputPath);
      })
      .on("error", (err) => {
        reject(err);
      })
      .save(outputPath);
  });
}

function formatTimestamp(seconds) {
  const date = new Date(seconds * 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms
    .toString()
    .padStart(3, "0")}`;
}

function convertToSrt(segments) {
  let srtContent = "";

  segments.forEach((segment, index) => {
    const startTime = formatTimestamp(segment.start);
    const endTime = formatTimestamp(segment.end);

    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${segment.text.trim()}\n\n`;
  });

  return srtContent;
}

function formatTimestampVtt(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

function convertToVtt(segments, width) {
  let vttContent = "WEBVTT\n\n";
  const sizeSetting = width ? ` size:${width}%` : "";

  segments.forEach((segment, index) => {
    const startTime = formatTimestampVtt(segment.start);
    const endTime = formatTimestampVtt(segment.end);

    vttContent += `${index + 1}\n`;
    vttContent += `${startTime} --> ${endTime}${sizeSetting}\n`;
    vttContent += `${segment.text.trim()}\n\n`;
  });

  return vttContent;
}

async function transcribeVideo(filePath, progressBar) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileExtension = path.extname(filePath).toLowerCase();
    if (fileExtension !== ".mp4") {
      throw new Error("Only MP4 files are supported");
    }

    const fileName = path.basename(filePath, ".mp4");
    const tempMp3Path = path.join(
      path.dirname(filePath),
      `${fileName}_temp.mp3`
    );

    progressBar.update(10, { stage: "Converting to MP3..." });

    await convertToMp3(filePath, tempMp3Path);

    progressBar.update(30, { stage: "Sending to Whisper API..." });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempMp3Path),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    progressBar.update(80, { stage: "Processing transcription..." });

    fs.unlinkSync(tempMp3Path);

    return {
      text: transcription.text,
      segments: transcription.segments,
    };
  } catch (error) {
    console.error("Error transcribing video:", error.message);
    throw error;
  }
}

function findMp4Files(folderPath) {
  const files = [];
  const items = fs.readdirSync(folderPath);

  for (const item of items) {
    const itemPath = path.join(folderPath, item);
    const stat = fs.statSync(itemPath);

    if (stat.isFile() && path.extname(item).toLowerCase() === ".mp4") {
      files.push(itemPath);
    }
  }

  return files;
}

async function processSingleFile(filePath, fileIndex, totalFiles, width) {
  const fileName = path.basename(filePath, ".mp4");
  const fileDir = path.dirname(filePath);
  const srtPath = path.join(fileDir, `${fileName}.srt`);
  const vttPath = path.join(fileDir, `${fileName}.vtt`);

  // Skip if both SRT and VTT already exist
  if (fs.existsSync(srtPath) && fs.existsSync(vttPath)) {
    console.log(`⏭️  Skipping ${fileName} (SRT and VTT already exist)`);
    return;
  }

  console.log(`\n📹 Processing file ${fileIndex}/${totalFiles}: ${fileName}`);

  const progressBar = new cliProgress.SingleBar({
    format: "File {value}/{total} |{bar}| {percentage}% | {stage}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  progressBar.start(100, 0, { stage: "Starting..." });

  try {
    const result = await transcribeVideo(filePath, progressBar);

    progressBar.update(85, { stage: "Creating SRT file..." });

    const srtContent = convertToSrt(result.segments);
    fs.writeFileSync(srtPath, srtContent);

    progressBar.update(95, { stage: "Creating VTT file..." });

    const vttContent = convertToVtt(result.segments, width);
    fs.writeFileSync(vttPath, vttContent);

    progressBar.update(100, { stage: "Complete!" });
    progressBar.stop();

    console.log(`✅ Subtitles saved to: ${srtPath}`);
    console.log(`✅ Subtitles saved to: ${vttPath}`);
  } catch (error) {
    progressBar.stop();
    console.error(`❌ Failed to process ${fileName}: ${error.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  let width = null;
  const positionalArgs = [];

  for (const arg of args) {
    const widthMatch = arg.match(/^--width=(\d+)$/);
    if (widthMatch) {
      width = parseInt(widthMatch[1], 10);
    } else {
      positionalArgs.push(arg);
    }
  }

  if (positionalArgs.length !== 1) {
    console.log(
      "Usage: node transcribe.js <path-to-folder> [--width=<percent>]"
    );
    process.exit(1);
  }

  const folderPath = positionalArgs[0];

  // Validate folder path
  if (!fs.existsSync(folderPath)) {
    console.error(`Error: Folder not found: ${folderPath}`);
    process.exit(1);
  }

  if (!fs.statSync(folderPath).isDirectory()) {
    console.error(`Error: Path is not a directory: ${folderPath}`);
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  try {
    const mp4Files = findMp4Files(folderPath);

    if (mp4Files.length === 0) {
      console.log(`No MP4 files found in: ${folderPath}`);
      process.exit(0);
    }

    console.log(`🎬 Found ${mp4Files.length} MP4 file(s) in: ${folderPath}`);

    for (let i = 0; i < mp4Files.length; i++) {
      await processSingleFile(mp4Files[i], i + 1, mp4Files.length, width);
    }

    console.log(
      `\n🎉 Batch processing complete! Processed ${mp4Files.length} file(s).`
    );
  } catch (error) {
    console.error("Failed to process folder:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { transcribeVideo };
