import { beforeEach, describe, expect, it } from 'vitest';
import { ScriptParserService } from './script-parser.service';

describe('ScriptParserService', () => {
  let service: ScriptParserService;

  beforeEach(() => {
    service = new ScriptParserService();
  });

  it('parses multi-line arg definitions with nested metadata', () => {
    const parsed = service.parse(`
      harm_levels = ABS(x_c)
      harm_summary_vis = {
        title: "Harmonic Summary",
        description: "Broadband RMS summary for extracted harmonic channels.",
        xAxisLabel: "Matched Harmonic",
        yAxisLabel: "Broadband RMS (dB)",
        xAxisCategories: ["H1", "H2", "H3"],
        channelInfo: {
          H1: "Fundamental broadband RMS level.",
          H2: "Second-order broadband RMS level.",
          H3: "Third-order broadband RMS level."
        }
      }
      p_harm_summary = VIS_OCTBARS(harm_levels, arg=harm_summary_vis)
    `);

    expect(parsed.argDefinitions.get('harm_summary_vis')).toEqual({
      title: 'Harmonic Summary',
      description: 'Broadband RMS summary for extracted harmonic channels.',
      xAxisLabel: 'Matched Harmonic',
      yAxisLabel: 'Broadband RMS (dB)',
      xAxisCategories: ['H1', 'H2', 'H3'],
      channelInfo: {
        H1: 'Fundamental broadband RMS level.',
        H2: 'Second-order broadband RMS level.',
        H3: 'Third-order broadband RMS level.',
      },
    });

    expect(parsed.operations.get('p_harm_summary')).toEqual(
      expect.objectContaining({
        type: 'VIS_OCTBARS',
        args: ['harm_levels'],
        isVisualization: true,
        argSettings: expect.objectContaining({
          title: 'Harmonic Summary',
          xAxisCategories: ['H1', 'H2', 'H3'],
        }),
      }),
    );
  });

  it('keeps single-line arg definitions working', () => {
    const parsed = service.parse(`
      Y_c = FFT(y_c)
      X_c = FFT(x_c)
      N_f = FFT(y_c)
      div_arg = { alpha:1.0, spectralFloor:-80, gamma:0.01 }
      H_c = DIVIDE(Y_c, X_c, N_f, arg=div_arg)
    `);

    expect(parsed.argDefinitions.get('div_arg')).toEqual({
      alpha: 1,
      spectralFloor: -80,
      gamma: 0.01,
    });
    expect(parsed.operations.get('H_c')?.argSettings).toEqual({
      alpha: 1,
      spectralFloor: -80,
      gamma: 0.01,
    });
  });

  it('preserves "=" and other special chars inside string literals', () => {
    // Regression: previously the convertToJson regex rewrote any `\w+ = ` it
    // saw, even inside quoted descriptions, which corrupted the JSON for
    // entries like `excess_gd_vis` in the phase-analysis preset.
    const parsed = service.parse(`
      excess_gd_vis = {
        title: "Excess Group Delay",
        description: "Group delay of the all-pass residual H/H_min: τ_excess = -d∠(H/H_min)/dω. Reveals non-minimum-phase structure.",
        xAxisLabel: "Frequency (Hz)",
        yAxisLabel: "Delay (samples)"
      }
      p_excess = VIS_GROUP_DELAY(x_c, arg=excess_gd_vis)
    `);

    const argDef = parsed.argDefinitions.get('excess_gd_vis');
    expect(argDef).toBeDefined();
    expect(argDef.title).toBe('Excess Group Delay');
    expect(argDef.description).toContain('τ_excess = -d∠(H/H_min)/dω');
    expect(argDef.xAxisLabel).toBe('Frequency (Hz)');
    expect(argDef.yAxisLabel).toBe('Delay (samples)');

    expect(parsed.operations.get('p_excess')?.argSettings?.title).toBe('Excess Group Delay');
  });
});