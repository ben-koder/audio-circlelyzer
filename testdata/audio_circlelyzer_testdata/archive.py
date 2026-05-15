from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import numpy as np


def encode_f32le_base64(channel: np.ndarray) -> str:
  samples = np.asarray(channel, dtype='<f4')
  return base64.b64encode(samples.tobytes()).decode('ascii')


def build_archive_document(
  *,
  archive_id: str,
  name: str,
  created_at: str,
  capture_mode: str,
  source_type: str,
  resolved_source: dict[str, Any],
  sample_rate: float,
  circular_length: int,
  recording_position: int,
  source_channel_count: int,
  preset_id: str,
  preset_name: str,
  excitation_channels: list[np.ndarray],
  recorded_channels: list[np.ndarray],
  notes: str | None = None,
) -> dict[str, Any]:
  recording_length = int(recorded_channels[0].shape[0])
  return {
    'format': {
      'kind': 'audio-circlelyzer-recording',
      'version': 1,
    },
    'metadata': {
      'id': archive_id,
      'name': name,
      'createdAt': created_at,
      'captureMode': capture_mode,
      'sourceType': source_type,
      'resolvedSource': resolved_source,
      'sampleRate': sample_rate,
      'circularLength': circular_length,
      'recordingLength': recording_length,
      'recordingPosition': recording_position % recording_length,
      'sourceChannelCount': source_channel_count,
      'recordingChannelCount': len(recorded_channels),
      'notes': notes,
      'preset': {
        'id': preset_id,
        'name': preset_name,
      },
    },
    'excitation': {
      'encoding': 'f32le-base64',
      'channels': [encode_f32le_base64(channel) for channel in excitation_channels],
    },
    'recording': {
      'encoding': 'f32le-base64',
      'channels': [encode_f32le_base64(channel) for channel in recorded_channels],
    },
  }


def write_json(path: Path, payload: dict[str, Any]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(payload, indent=2), encoding='utf-8')


def write_archive(path: Path, payload: dict[str, Any]) -> None:
  write_json(path, payload)