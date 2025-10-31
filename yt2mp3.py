import os
import re
import sys
import shutil
import tempfile

import ffmpeg
import mutagen
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3NoHeaderError
import yt_dlp


def sanitize_title(title):
    if not title:
        return ""
    cleaned = re.sub(r"[\\\\/:*?\"<>|]", " ", title)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def ensure_unique_path(path):
    base, ext = os.path.splitext(path)
    counter = 1
    unique_path = path
    while os.path.exists(unique_path):
        unique_path = f"{base}_{counter}{ext}"
        counter += 1
    return unique_path


def apply_metadata(file_path, title, artist, album):
    try:
        audio = EasyID3(file_path)
    except ID3NoHeaderError:
        audio_file = mutagen.File(file_path, easy=True)
        if audio_file is None:
            return
        audio_file.add_tags()
        audio_file.save()
        audio = EasyID3(file_path)
    if title:
        audio["title"] = [title]
    if artist:
        audio["artist"] = [artist]
    if album:
        audio["album"] = [album]
    audio.save()


def download_and_convert(url):
    if not url:
        raise ValueError("URL manquante")
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
    os.makedirs(output_dir, exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix="yt2mp3_")
    try:
        print("Téléchargement en cours…")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(temp_dir, "%(id)s.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise RuntimeError("Aucune information téléchargée")
            if "entries" in info and info["entries"]:
                info = info["entries"][0]
            downloaded_path = ydl.prepare_filename(info)
        if not os.path.isfile(downloaded_path):
            candidates = [os.path.join(temp_dir, f) for f in os.listdir(temp_dir)]
            if not candidates:
                raise FileNotFoundError("Fichier audio introuvable")
            downloaded_path = candidates[0]
        print("Extraction des métadonnées…")
        title = info.get("title")
        artist = info.get("artist") or info.get("uploader") or info.get("creator")
        album = info.get("album") or info.get("playlist_title")
        sanitized_title = sanitize_title(title) or info.get("id") or "audio"
        final_temp_path = os.path.join(temp_dir, f"{sanitized_title}.mp3")
        print("Conversion en MP3…")
        if downloaded_path.lower().endswith(".mp3"):
            shutil.copy2(downloaded_path, final_temp_path)
        else:
            try:
                (
                    ffmpeg
                    .input(downloaded_path)
                    .output(
                        final_temp_path,
                        **{"c:a": "libmp3lame"},
                        audio_bitrate="320k",
                        format="mp3",
                        ac=2,
                    )
                    .global_args("-loglevel", "error")
                    .overwrite_output()
                    .run()
                )
            except ffmpeg.Error as exc:
                raise RuntimeError(f"Échec de la conversion : {exc}") from exc
        apply_metadata(final_temp_path, title, artist, album)
        final_output_path = ensure_unique_path(os.path.join(output_dir, f"{sanitized_title}.mp3"))
        shutil.move(final_temp_path, final_output_path)
        print(f"Conversion terminée : {os.path.basename(final_output_path)}")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            raise ValueError("Veuillez fournir une URL valide.")
        download_and_convert(sys.argv[1])
    except Exception as error:
        print(f"Erreur : {error}")
        sys.exit(1)
