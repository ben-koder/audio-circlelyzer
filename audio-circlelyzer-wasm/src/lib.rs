use wasm_bindgen::prelude::*;
use audio_circlelyzer_lib::{
    fft::FFTContext,
    signal_generation,
    circular_ops,
    octave_filtering::{octave_filter_rms, OctaveMode},
    rt60,
    bandpass,
    stft,
    phase_analysis,
    poly_regression,
};
use serde::{Deserialize, Serialize};
use minijinja::{Environment, Value};
use std::collections::HashMap;

// Set panic hook for better error messages
#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct WasmFFTContext {
    context: FFTContext,
}

#[wasm_bindgen]
impl WasmFFTContext {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> Self {
        Self {
            context: FFTContext::new(size),
        }
    }
    
    /// Perform real FFT
    #[wasm_bindgen(js_name = fft)]
    pub fn fft(&self, input: &[f32]) -> WasmComplexSpectrum {
        let (re, im) = self.context.real_fft(input);
        WasmComplexSpectrum { re, im }
    }
    
    /// Perform inverse real FFT
    #[wasm_bindgen(js_name = ifft)]
    pub fn ifft(&self, spectrum: &WasmComplexSpectrum) -> Vec<f32> {
        self.context.real_ifft(&spectrum.re, &spectrum.im)
    }
}

#[wasm_bindgen]
pub struct WasmComplexSpectrum {
    re: Vec<f32>,
    im: Vec<f32>,
}

#[wasm_bindgen]
impl WasmComplexSpectrum {
    #[wasm_bindgen(constructor)]
    pub fn new(re: Vec<f32>, im: Vec<f32>) -> Self {
        Self { re, im }
    }
    
    #[wasm_bindgen(getter)]
    pub fn re(&self) -> Vec<f32> {
        self.re.clone()
    }
    
    #[wasm_bindgen(getter)]
    pub fn im(&self) -> Vec<f32> {
        self.im.clone()
    }
    
    #[wasm_bindgen(js_name = getRe)]
    pub fn get_re(&self) -> js_sys::Float32Array {
        js_sys::Float32Array::from(&self.re[..])
    }
    
    #[wasm_bindgen(js_name = getIm)]
    pub fn get_im(&self) -> js_sys::Float32Array {
        js_sys::Float32Array::from(&self.im[..])
    }
}

// Signal generation functions
#[wasm_bindgen(js_name = generatePerfectWhite)]
pub fn generate_perfect_white(len: usize, sample_rate: f32) -> Vec<f32> {
    signal_generation::generate_perfect_white(len, sample_rate)
}

#[wasm_bindgen(js_name = generatePerfectPink)]
pub fn generate_perfect_pink(len: usize, sample_rate: f32) -> Vec<f32> {
    signal_generation::generate_perfect_pink(len, sample_rate)
}

#[wasm_bindgen(js_name = generateWhite)]
pub fn generate_white(len: usize) -> Vec<f32> {
    signal_generation::generate_white(len)
}

#[wasm_bindgen(js_name = generatePink)]
pub fn generate_pink(len: usize, sample_rate: f32) -> Vec<f32> {
    signal_generation::generate_pink(len, sample_rate)
}

#[wasm_bindgen(js_name = generateFrequencyDivisionPerfectWhite)]
pub fn generate_frequency_division_perfect_white(
    len: usize,
    sample_rate: f32,
    source_index: usize,
    source_count: usize,
) -> Vec<f32> {
    signal_generation::generate_frequency_division_perfect_white(
        len,
        sample_rate,
        source_index,
        source_count,
    )
}

#[wasm_bindgen(js_name = generateZadoffChu)]
pub fn generate_zadoff_chu(len: usize, root: usize) -> Vec<f32> {
    signal_generation::generate_zadoff_chu(len, root)
}

// Complex operations
#[wasm_bindgen(js_name = complexDivide)]
pub fn complex_divide(
    y_re: &[f32],
    y_im: &[f32],
    x_re: &[f32],
    x_im: &[f32],
) -> WasmComplexSpectrum {
    let (re, im) = circular_ops::complex_divide(y_re, y_im, x_re, x_im);
    WasmComplexSpectrum { re, im }
}

#[wasm_bindgen(js_name = complexAbs)]
pub fn complex_abs(re: &[f32], im: &[f32]) -> Vec<f32> {
    circular_ops::complex_abs(re, im)
}

#[wasm_bindgen(js_name = complexArg)]
pub fn complex_arg(re: &[f32], im: &[f32]) -> Vec<f32> {
    circular_ops::complex_arg(re, im)
}

#[wasm_bindgen(js_name = phaseUnwrap)]
pub fn phase_unwrap(phase: &[f32]) -> Vec<f32> {
    circular_ops::phase_unwrap(phase)
}

// Octave filtering
#[wasm_bindgen(js_name = octaveFilterRms)]
pub fn octave_filter_rms_wasm(
    magnitude_spectrum: &[f32],
    sample_rate: f32,
    nc: usize,
    mode: &str,
) -> Vec<f32> {
    let octave_mode = match mode {
        "third" => OctaveMode::Third,
        _ => OctaveMode::Full,
    };
    
    octave_filter_rms(magnitude_spectrum, sample_rate, nc, octave_mode)
}

// RT60 calculation
#[wasm_bindgen]
pub struct WasmRT60Result {
    rt60: f32,
    decay_curve: Vec<f32>,
    time_axis: Vec<f32>,
    fit_start_idx: usize,
    fit_end_idx: usize,
    slope: f32,
    intercept: f32,
}

#[wasm_bindgen]
impl WasmRT60Result {
    #[wasm_bindgen(getter)]
    pub fn rt60(&self) -> f32 {
        self.rt60
    }
    
    #[wasm_bindgen(getter, js_name = decayCurve)]
    pub fn decay_curve(&self) -> Vec<f32> {
        self.decay_curve.clone()
    }
    
    #[wasm_bindgen(getter, js_name = timeAxis)]
    pub fn time_axis(&self) -> Vec<f32> {
        self.time_axis.clone()
    }
    
    #[wasm_bindgen(getter, js_name = fitStartIdx)]
    pub fn fit_start_idx(&self) -> usize {
        self.fit_start_idx
    }
    
    #[wasm_bindgen(getter, js_name = fitEndIdx)]
    pub fn fit_end_idx(&self) -> usize {
        self.fit_end_idx
    }
    
    #[wasm_bindgen(getter)]
    pub fn slope(&self) -> f32 {
        self.slope
    }
    
    #[wasm_bindgen(getter)]
    pub fn intercept(&self) -> f32 {
        self.intercept
    }
}

#[wasm_bindgen(js_name = calculateRT60)]
pub fn calculate_rt60(
    impulse_response: &[f32],
    sample_rate: f32,
    start_db: f32,
    end_db: f32,
) -> WasmRT60Result {
    let result = rt60::calculate_rt60(impulse_response, sample_rate, start_db, end_db);
    
    WasmRT60Result {
        rt60: result.rt60,
        decay_curve: result.decay_curve,
        time_axis: result.time_axis,
        fit_start_idx: result.fit_start_idx,
        fit_end_idx: result.fit_end_idx,
        slope: result.slope,
        intercept: result.intercept,
    }
}

// Decay measurement for full RT60 result
#[wasm_bindgen]
pub struct WasmDecayMeasurement {
    value: f32,
    slope: f32,
    intercept: f32,
    correlation: f32,
    start_idx: usize,
    end_idx: usize,
    is_reliable: bool,
}

#[wasm_bindgen]
impl WasmDecayMeasurement {
    #[wasm_bindgen(getter)]
    pub fn value(&self) -> f32 { self.value }
    
    #[wasm_bindgen(getter)]
    pub fn slope(&self) -> f32 { self.slope }
    
    #[wasm_bindgen(getter)]
    pub fn intercept(&self) -> f32 { self.intercept }
    
    #[wasm_bindgen(getter)]
    pub fn correlation(&self) -> f32 { self.correlation }
    
    #[wasm_bindgen(getter, js_name = startIdx)]
    pub fn start_idx(&self) -> usize { self.start_idx }
    
    #[wasm_bindgen(getter, js_name = endIdx)]
    pub fn end_idx(&self) -> usize { self.end_idx }
    
    #[wasm_bindgen(getter, js_name = isReliable)]
    pub fn is_reliable(&self) -> bool { self.is_reliable }
}

impl From<&rt60::DecayMeasurement> for WasmDecayMeasurement {
    fn from(dm: &rt60::DecayMeasurement) -> Self {
        WasmDecayMeasurement {
            value: dm.value,
            slope: dm.slope,
            intercept: dm.intercept,
            correlation: dm.correlation,
            start_idx: dm.start_idx,
            end_idx: dm.end_idx,
            is_reliable: dm.is_reliable,
        }
    }
}

// Full RT60 result per ISO 3382
#[wasm_bindgen]
pub struct WasmRT60FullResult {
    edt: WasmDecayMeasurement,
    t20: WasmDecayMeasurement,
    t30: WasmDecayMeasurement,
    topt: WasmDecayMeasurement,
    c50: f32,
    c80: f32,
    d50: f32,
    ts: f32,
    curvature: f32,
    decay_curve: Vec<f32>,
    time_axis: Vec<f32>,
    noise_floor: f32,
}

#[wasm_bindgen]
impl WasmRT60FullResult {
    #[wasm_bindgen(getter)]
    pub fn edt(&self) -> WasmDecayMeasurement {
        WasmDecayMeasurement {
            value: self.edt.value,
            slope: self.edt.slope,
            intercept: self.edt.intercept,
            correlation: self.edt.correlation,
            start_idx: self.edt.start_idx,
            end_idx: self.edt.end_idx,
            is_reliable: self.edt.is_reliable,
        }
    }
    
    #[wasm_bindgen(getter)]
    pub fn t20(&self) -> WasmDecayMeasurement {
        WasmDecayMeasurement {
            value: self.t20.value,
            slope: self.t20.slope,
            intercept: self.t20.intercept,
            correlation: self.t20.correlation,
            start_idx: self.t20.start_idx,
            end_idx: self.t20.end_idx,
            is_reliable: self.t20.is_reliable,
        }
    }
    
    #[wasm_bindgen(getter)]
    pub fn t30(&self) -> WasmDecayMeasurement {
        WasmDecayMeasurement {
            value: self.t30.value,
            slope: self.t30.slope,
            intercept: self.t30.intercept,
            correlation: self.t30.correlation,
            start_idx: self.t30.start_idx,
            end_idx: self.t30.end_idx,
            is_reliable: self.t30.is_reliable,
        }
    }
    
    #[wasm_bindgen(getter)]
    pub fn topt(&self) -> WasmDecayMeasurement {
        WasmDecayMeasurement {
            value: self.topt.value,
            slope: self.topt.slope,
            intercept: self.topt.intercept,
            correlation: self.topt.correlation,
            start_idx: self.topt.start_idx,
            end_idx: self.topt.end_idx,
            is_reliable: self.topt.is_reliable,
        }
    }
    
    #[wasm_bindgen(getter)]
    pub fn c50(&self) -> f32 { self.c50 }
    
    #[wasm_bindgen(getter)]
    pub fn c80(&self) -> f32 { self.c80 }
    
    #[wasm_bindgen(getter)]
    pub fn d50(&self) -> f32 { self.d50 }
    
    #[wasm_bindgen(getter)]
    pub fn ts(&self) -> f32 { self.ts }
    
    #[wasm_bindgen(getter)]
    pub fn curvature(&self) -> f32 { self.curvature }
    
    #[wasm_bindgen(getter, js_name = decayCurve)]
    pub fn decay_curve(&self) -> Vec<f32> { self.decay_curve.clone() }
    
    #[wasm_bindgen(getter, js_name = timeAxis)]
    pub fn time_axis(&self) -> Vec<f32> { self.time_axis.clone() }
    
    #[wasm_bindgen(getter, js_name = noiseFloor)]
    pub fn noise_floor(&self) -> f32 { self.noise_floor }
}

#[wasm_bindgen(js_name = calculateRT60Full)]
pub fn calculate_rt60_full(
    impulse_response: &[f32],
    sample_rate: f32,
) -> WasmRT60FullResult {
    let result = rt60::calculate_rt60_full(impulse_response, sample_rate);
    
    WasmRT60FullResult {
        edt: WasmDecayMeasurement::from(&result.edt),
        t20: WasmDecayMeasurement::from(&result.t20),
        t30: WasmDecayMeasurement::from(&result.t30),
        topt: WasmDecayMeasurement::from(&result.topt),
        c50: result.c50,
        c80: result.c80,
        d50: result.d50,
        ts: result.ts,
        curvature: result.curvature,
        decay_curve: result.decay_curve,
        time_axis: result.time_axis,
        noise_floor: result.noise_floor,
    }
}

// Bandpass filter
#[wasm_bindgen(js_name = bandpassFilter)]
pub fn bandpass_filter_wasm(
    re: &[f32],
    im: &[f32],
    sample_rate: f32,
    nc: usize,
    low_freq: Option<f32>,
    high_freq: Option<f32>,
) -> WasmComplexSpectrum {
    let (out_re, out_im) = bandpass::bandpass_filter(re, im, sample_rate, nc, low_freq, high_freq);
    WasmComplexSpectrum { re: out_re, im: out_im }
}

#[wasm_bindgen(js_name = bandpassFilterSmooth)]
pub fn bandpass_filter_smooth_wasm(
    re: &[f32],
    im: &[f32],
    sample_rate: f32,
    nc: usize,
    low_freq: Option<f32>,
    high_freq: Option<f32>,
    order: u32,
) -> WasmComplexSpectrum {
    let (out_re, out_im) = bandpass::bandpass_filter_smooth(re, im, sample_rate, nc, low_freq, high_freq, order);
    WasmComplexSpectrum { re: out_re, im: out_im }
}

// ============================================================================
// STFT (Short-Time Fourier Transform)
// ============================================================================

/// Result of STFT computation
#[wasm_bindgen]
pub struct WasmSTFTResult {
    /// Flattened magnitude data (row-major: [frame0_bin0, frame0_bin1, ..., frame1_bin0, ...])
    magnitudes_db: Vec<f32>,
    /// Time axis values in seconds
    time_axis: Vec<f32>,
    /// Frequency axis values in Hz
    frequency_axis: Vec<f32>,
    /// Number of time frames
    num_frames: usize,
    /// Number of frequency bins
    num_bins: usize,
}

#[wasm_bindgen]
impl WasmSTFTResult {
    #[wasm_bindgen(getter, js_name = magnitudesDb)]
    pub fn magnitudes_db(&self) -> Vec<f32> {
        self.magnitudes_db.clone()
    }
    
    #[wasm_bindgen(getter, js_name = timeAxis)]
    pub fn time_axis(&self) -> Vec<f32> {
        self.time_axis.clone()
    }
    
    #[wasm_bindgen(getter, js_name = frequencyAxis)]
    pub fn frequency_axis(&self) -> Vec<f32> {
        self.frequency_axis.clone()
    }
    
    #[wasm_bindgen(getter, js_name = numFrames)]
    pub fn num_frames(&self) -> usize {
        self.num_frames
    }
    
    #[wasm_bindgen(getter, js_name = numBins)]
    pub fn num_bins(&self) -> usize {
        self.num_bins
    }
}

/// Compute STFT of a time signal
/// 
/// # Arguments
/// * `signal` - Input time signal
/// * `sample_rate` - Sample rate in Hz
/// * `fft_size` - Size of each FFT window
/// * `overlap` - If true, windows overlap by 50%
#[wasm_bindgen(js_name = computeStft)]
pub fn compute_stft_wasm(
    signal: &[f32],
    sample_rate: f32,
    fft_size: usize,
    overlap: bool,
) -> WasmSTFTResult {
    let result = stft::compute_stft(signal, sample_rate, fft_size, overlap);
    let magnitudes_db = stft::flatten_stft_magnitudes(&result);
    
    WasmSTFTResult {
        magnitudes_db,
        time_axis: result.time_axis,
        frequency_axis: result.frequency_axis,
        num_frames: result.num_frames,
        num_bins: result.num_bins,
    }
}

// ============================================================================
// Preset YAML Loading with MiniJinja Templating
// ============================================================================

/// Layout node for preset visualization layout
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum LayoutNode {
    #[serde(rename = "visualization")]
    Visualization {
        #[serde(rename = "visualizationType")]
        #[serde(skip_serializing_if = "Option::is_none")]
        visualization_type: Option<String>,
        #[serde(rename = "contextKey")]
        context_key: String,
    },
    #[serde(rename = "split")]
    Split {
        direction: String,
        #[serde(rename = "splitRatio")]
        split_ratio: f32,
        children: Vec<LayoutNode>,
    },
}

/// Preset settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetSettings {
    pub nc: u32,
    pub n_y: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResolvedSourceConfig {
    #[serde(rename = "groupId")]
    #[serde(default)]
    pub group_id: Option<String>,
    #[serde(rename = "signalType")]
    #[serde(default)]
    pub signal_type: Option<String>,
    #[serde(rename = "circularLength")]
    #[serde(default)]
    pub circular_length: Option<u32>,
    #[serde(rename = "logicalSourceCount")]
    #[serde(default)]
    pub logical_source_count: Option<u32>,
    #[serde(rename = "outputChannelCount")]
    #[serde(default)]
    pub output_channel_count: Option<u32>,
    #[serde(rename = "routingMode")]
    #[serde(default)]
    pub routing_mode: Option<String>,
    #[serde(rename = "zadoffChuRoot")]
    #[serde(default)]
    pub zadoff_chu_root: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PresetSourceConstraints {
    #[serde(rename = "circularLengths")]
    #[serde(default)]
    pub circular_lengths: Option<Vec<u32>>,
    #[serde(rename = "outputChannelCounts")]
    #[serde(default)]
    pub output_channel_counts: Option<Vec<u32>>,
    #[serde(rename = "routingModes")]
    #[serde(default)]
    pub routing_modes: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PresetSourceDefinition {
    #[serde(rename = "supportedGroups")]
    #[serde(default)]
    pub supported_groups: Vec<String>,
    #[serde(default)]
    pub defaults: Option<ResolvedSourceConfig>,
    #[serde(default)]
    pub constraints: Option<PresetSourceConstraints>,
}

/// Context preset structure matching TypeScript interface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub script: String,
    #[serde(default)]
    #[serde(rename = "scriptVariables")]
    pub script_variables: HashMap<String, serde_json::Value>,
    pub layout: LayoutNode,
    #[serde(rename = "signalType")]
    #[serde(default)]
    pub signal_type: Option<String>,
    #[serde(default)]
    pub source: Option<PresetSourceDefinition>,
    pub settings: PresetSettings,
}

/// Parse a single preset from YAML content
#[wasm_bindgen(js_name = parsePresetYaml)]
pub fn parse_preset_yaml(yaml_content: &str) -> Result<JsValue, JsValue> {
    let preset: ContextPreset = serde_yaml::from_str(yaml_content)
        .map_err(|e| JsValue::from_str(&format!("YAML parse error: {}", e)))?;
    
    serde_wasm_bindgen::to_value(&preset)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Parse preset YAML and apply MiniJinja templating to the script
#[wasm_bindgen(js_name = parsePresetYamlWithTemplating)]
pub fn parse_preset_yaml_with_templating(yaml_content: &str, variables_json: &str) -> Result<JsValue, JsValue> {
    // Parse YAML first
    let mut preset: ContextPreset = serde_yaml::from_str(yaml_content)
        .map_err(|e| JsValue::from_str(&format!("YAML parse error: {}", e)))?;
    
    // Parse variables from JSON
    let variables: HashMap<String, serde_json::Value> = if variables_json.is_empty() {
        preset.script_variables.clone()
    } else {
        serde_json::from_str(variables_json)
            .map_err(|e| JsValue::from_str(&format!("Variables JSON parse error: {}", e)))?
    };
    
    // Apply MiniJinja templating to the script
    if !variables.is_empty() {
        let mut env = Environment::new();
        env.add_template("script", &preset.script)
            .map_err(|e| JsValue::from_str(&format!("Template parse error: {}", e)))?;
        
        let template = env.get_template("script")
            .map_err(|e| JsValue::from_str(&format!("Template get error: {}", e)))?;
        
        // Convert variables to MiniJinja Value
        let ctx = Value::from_serialize(&variables);
        
        preset.script = template.render(ctx)
            .map_err(|e| JsValue::from_str(&format!("Template render error: {}", e)))?;
    }
    
    serde_wasm_bindgen::to_value(&preset)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Process script with MiniJinja templating only
#[wasm_bindgen(js_name = processScriptTemplate)]
pub fn process_script_template(script: &str, variables_json: &str) -> Result<String, JsValue> {
    if variables_json.is_empty() || variables_json == "{}" {
        return Ok(script.to_string());
    }
    
    let variables: HashMap<String, serde_json::Value> = serde_json::from_str(variables_json)
        .map_err(|e| JsValue::from_str(&format!("Variables JSON parse error: {}", e)))?;
    
    let mut env = Environment::new();
    env.add_template("script", script)
        .map_err(|e| JsValue::from_str(&format!("Template parse error: {}", e)))?;
    
    let template = env.get_template("script")
        .map_err(|e| JsValue::from_str(&format!("Template get error: {}", e)))?;
    
    let ctx = Value::from_serialize(&variables);
    
    template.render(ctx)
        .map_err(|e| JsValue::from_str(&format!("Template render error: {}", e)))
}

/// Strip comments from script (lines starting with # or content after #)
#[wasm_bindgen(js_name = stripScriptComments)]
pub fn strip_script_comments(script: &str) -> String {
    script
        .lines()
        .map(|line| {
            // Find first # that's not inside a string or JSON
            if let Some(idx) = find_comment_start(line) {
                line[..idx].trim_end()
            } else {
                line
            }
        })
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_layout_yaml() -> &'static str {
        r#"
layout:
    type: visualization
    contextKey: p_main
"#
    }

    #[test]
    fn parses_legacy_signal_type_presets() {
        let yaml = format!(
            r#"
id: legacy-room
name: Legacy Room
description: Legacy preset shape
signalType: PERFECT_PINK
scriptVariables: {{}}
settings:
    nc: 32768
    n_y: 8
script: |
    X_c = FFT(x_c)
{}
"#,
            minimal_layout_yaml()
        );

        let preset: ContextPreset = serde_yaml::from_str(&yaml).expect("legacy preset should parse");

        assert_eq!(preset.signal_type.as_deref(), Some("PERFECT_PINK"));
        assert!(preset.source.is_none());
    }

    #[test]
    fn parses_new_source_definition_presets() {
        let yaml = format!(
            r#"
id: source-aware-room
name: Source Aware Room
description: New preset shape
scriptVariables: {{}}
source:
    supportedGroups:
        - noise-excitation
    defaults:
        groupId: noise-excitation
        signalType: PERFECT_WHITE
        circularLength: 65536
        logicalSourceCount: 1
        outputChannelCount: 2
        routingMode: mirrored_mono
    constraints:
        circularLengths: [65536]
        outputChannelCounts: [2]
        routingModes: [mirrored_mono, direct]
settings:
    nc: 65536
    n_y: 8
script: |
    X_c = FFT(x_c)
{}
"#,
            minimal_layout_yaml()
        );

        let preset: ContextPreset = serde_yaml::from_str(&yaml).expect("source-aware preset should parse");

        assert_eq!(preset.signal_type, None);
        let source = preset.source.expect("source definition should be preserved");
        assert_eq!(source.supported_groups, vec!["noise-excitation"]);
        let defaults = source.defaults.expect("defaults should be preserved");
        assert_eq!(defaults.signal_type.as_deref(), Some("PERFECT_WHITE"));
        assert_eq!(defaults.output_channel_count, Some(2));
    }

    #[test]
    fn parses_frequency_division_and_nonlinear_source_groups() {
        let yaml = format!(
            r#"
id: multi-source-harmonic
name: Multi Source Harmonic
description: Extended source groups
scriptVariables: {{}}
source:
    supportedGroups:
        - frequency-division-multi-source
        - nonlinear-zadoff-chu
    defaults:
        groupId: frequency-division-multi-source
        signalType: MULTI_SOURCE_WHITE
        circularLength: 32768
        logicalSourceCount: 2
        outputChannelCount: 2
        routingMode: direct
settings:
    nc: 32768
    n_y: 8
script: |
    X_c = FFT(x_c)
{}
"#,
            minimal_layout_yaml()
        );

        let preset: ContextPreset = serde_yaml::from_str(&yaml).expect("extended source-group preset should parse");

        let source = preset.source.expect("source definition should exist");
        assert_eq!(
            source.supported_groups,
            vec!["frequency-division-multi-source", "nonlinear-zadoff-chu"],
        );
        let defaults = source.defaults.expect("defaults should be preserved");
        assert_eq!(defaults.group_id.as_deref(), Some("frequency-division-multi-source"));
        assert_eq!(defaults.signal_type.as_deref(), Some("MULTI_SOURCE_WHITE"));
        assert_eq!(defaults.routing_mode.as_deref(), Some("direct"));
    }
}

/// Find the start of a comment in a line, respecting strings and JSON
fn find_comment_start(line: &str) -> Option<usize> {
    let mut in_string = false;
    let mut in_brace = 0;
    let chars = line.chars().enumerate();
    
    for (idx, ch) in chars {
        match ch {
            '"' if !in_string => in_string = true,
            '"' if in_string => in_string = false,
            '{' if !in_string => in_brace += 1,
            '}' if !in_string && in_brace > 0 => in_brace -= 1,
            '#' if !in_string && in_brace == 0 => return Some(idx),
            _ => {}
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Phase analysis bindings
// ---------------------------------------------------------------------------

/// Compute group delay from a complex spectrum (ramp-DFT method, no phase unwrapping).
///
/// Returns group delay in samples for each DFT bin (length = N).
#[wasm_bindgen(js_name = computeGroupDelay)]
pub fn compute_group_delay(re: &[f32], im: &[f32]) -> Vec<f32> {
    phase_analysis::group_delay_from_spectrum(re, im)
}

/// Reconstruct unwrapped phase by integrating group delay (trapezoidal rule).
///
/// `tau_g`  — group delay array (length N, from computeGroupDelay)
/// `h_re`   — real part of transfer function (length N)
/// `h_im`   — imaginary part of transfer function (length N)
///
/// Returns unwrapped phase in radians (length = N).
#[wasm_bindgen(js_name = unwrappedPhaseFromGroupDelay)]
pub fn unwrapped_phase_from_group_delay_wasm(
    tau_g: &[f32],
    h_re: &[f32],
    h_im: &[f32],
) -> Vec<f32> {
    phase_analysis::unwrapped_phase_from_group_delay(tau_g, h_re, h_im)
}

/// Compute phase delay from unwrapped phase.
///
/// Returns phase delay in samples (length = N).
#[wasm_bindgen(js_name = phaseDelayFromUnwrappedPhase)]
pub fn phase_delay_from_unwrapped_phase_wasm(theta: &[f32]) -> Vec<f32> {
    phase_analysis::phase_delay_from_unwrapped_phase(theta)
}

/// Compute the minimum-phase transfer function via the cepstral method.
///
/// `re`, `im`   — complex transfer function (length N)
/// `floor_db`   — noise floor in dB below peak magnitude (e.g. -120.0)
///
/// Returns a WasmComplexSpectrum with the minimum-phase transfer function.
#[wasm_bindgen(js_name = computeMinimumPhaseSpectrum)]
pub fn compute_minimum_phase_spectrum(
    re: &[f32],
    im: &[f32],
    floor_db: f32,
) -> WasmComplexSpectrum {
    let (result_re, result_im) = phase_analysis::minimum_phase_spectrum(re, im, floor_db);
    WasmComplexSpectrum { re: result_re, im: result_im }
}

/// Estimate the onset delay using minimum-phase / all-pass decomposition.
///
/// Returns the estimated delay in samples (fractional).
#[wasm_bindgen(js_name = estimateDelayMinimumPhaseExcess)]
pub fn estimate_delay_minimum_phase_excess_wasm(
    re: &[f32],
    im: &[f32],
    floor_db: f32,
) -> f32 {
    phase_analysis::estimate_delay_minimum_phase_excess(re, im, floor_db)
}

/// Apply a fractional circular shift to remove a known delay from a spectrum.
///
/// `re`, `im`         — complex transfer function (length N)
/// `delay_samples`    — delay to remove (samples, can be fractional)
///
/// Returns aligned WasmComplexSpectrum.
#[wasm_bindgen(js_name = alignSpectrumFractionalShift)]
pub fn align_spectrum_fractional_shift_wasm(
    re: &[f32],
    im: &[f32],
    delay_samples: f32,
) -> WasmComplexSpectrum {
    let (result_re, result_im) =
        phase_analysis::align_spectrum_fractional_shift(re, im, delay_samples);
    WasmComplexSpectrum { re: result_re, im: result_im }
}

// =============================================================================
// Polynomial gray-box regression — see audio-circlelyzer-lib/poly_regression.rs
// and theory/CIRCULAR_NONLINEAR_REGRESSION.md §3.4 (joint) and §3.10
// (matched-filter / per-order block-triangular).
// =============================================================================

#[derive(Serialize, Deserialize)]
struct PolyFitResultJs {
    coeffs: Vec<f32>,
    std_errors: Vec<f32>,
    monomial_labels: Vec<String>,
    monomial_powers: Vec<Vec<u32>>,
    condition_number: f32,
    residual_norm: f32,
    rhs_norm: f32,
    residual_re: Vec<f32>,
    residual_im: Vec<f32>,
    state_time: Vec<Vec<f32>>,
    forcing_time: Vec<f32>,
}

impl From<poly_regression::PolyFitResult> for PolyFitResultJs {
    fn from(r: poly_regression::PolyFitResult) -> Self {
        Self {
            coeffs: r.coeffs,
            std_errors: r.std_errors,
            monomial_labels: r.monomial_labels,
            monomial_powers: r.monomial_powers,
            condition_number: r.condition_number,
            residual_norm: r.residual_norm,
            rhs_norm: r.rhs_norm,
            residual_re: r.residual_re,
            residual_im: r.residual_im,
            state_time: r.state_time,
            forcing_time: r.forcing_time,
        }
    }
}

fn build_spec(
    derivatives: u32,
    degree: u32,
    n: usize,
    sample_rate: f32,
) -> poly_regression::PolyModelSpec {
    poly_regression::PolyModelSpec {
        derivatives,
        degree,
        n,
        sample_rate,
        fix_leading: false,
    }
}

/// Fit the joint polynomial regression of §3.4 to a single (y, u) spectrum
/// pair. Returns one PolyFitResult.
#[wasm_bindgen(js_name = polyRegressionJoint)]
pub fn poly_regression_joint_wasm(
    y_re: &[f32],
    y_im: &[f32],
    u_re: &[f32],
    u_im: &[f32],
    weights: Option<Vec<f32>>,
    derivatives: u32,
    degree: u32,
    n: usize,
    sample_rate: f32,
) -> Result<JsValue, JsValue> {
    let spec = build_spec(derivatives, degree, n, sample_rate);
    let weights_ref = weights.as_deref();
    let res = poly_regression::fit_joint(y_re, y_im, u_re, u_im, weights_ref, &spec)
        .map_err(|e| JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&PolyFitResultJs::from(res))
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Fit the per-order matched-filter regression of §3.10 (block-triangular).
/// `harmonics_concat` is P×N f32 array (row-major) of H_p[k] real parts;
/// `up_concat` is P×N of U_p[k] real parts. Imag parts likewise.
#[wasm_bindgen(js_name = polyRegressionMatchedFilter)]
pub fn poly_regression_matched_filter_wasm(
    y_re: &[f32],
    y_im: &[f32],
    harmonics_re_concat: &[f32],
    harmonics_im_concat: &[f32],
    up_re_concat: &[f32],
    up_im_concat: &[f32],
    p_max: usize,
    derivatives: u32,
    degree: u32,
    n: usize,
    sample_rate: f32,
) -> Result<JsValue, JsValue> {
    if harmonics_re_concat.len() != p_max * n
        || harmonics_im_concat.len() != p_max * n
        || up_re_concat.len() != p_max * n
        || up_im_concat.len() != p_max * n
    {
        return Err(JsValue::from_str(&format!(
            "Concatenated arrays must have length p_max·n = {}·{} = {}",
            p_max,
            n,
            p_max * n
        )));
    }
    let h_re_rows: Vec<&[f32]> =
        (0..p_max).map(|p| &harmonics_re_concat[p * n..(p + 1) * n]).collect();
    let h_im_rows: Vec<&[f32]> =
        (0..p_max).map(|p| &harmonics_im_concat[p * n..(p + 1) * n]).collect();
    let u_re_rows: Vec<&[f32]> =
        (0..p_max).map(|p| &up_re_concat[p * n..(p + 1) * n]).collect();
    let u_im_rows: Vec<&[f32]> =
        (0..p_max).map(|p| &up_im_concat[p * n..(p + 1) * n]).collect();
    let spec = build_spec(derivatives, degree, n, sample_rate);
    let results = poly_regression::fit_matched_filter(
        y_re,
        y_im,
        &h_re_rows,
        &h_im_rows,
        &u_re_rows,
        &u_im_rows,
        None,
        &spec,
    )
    .map_err(|e| JsValue::from_str(&e))?;
    let js_results: Vec<PolyFitResultJs> = results.into_iter().map(Into::into).collect();
    serde_wasm_bindgen::to_value(&js_results)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// Compute U_p[k] for p = 1..=p_max from a time-domain stimulus u[n].
/// Returns a flat re/im array pair, length p_max·n each (row-major).
#[wasm_bindgen(js_name = polyMatchedFilterSpectra)]
pub fn poly_matched_filter_spectra_wasm(
    u_time: &[f32],
    p_max: usize,
) -> WasmComplexSpectrum {
    let pairs = poly_regression::build_matched_filter_spectra(u_time, p_max);
    let n = u_time.len();
    let mut re = Vec::with_capacity(p_max * n);
    let mut im = Vec::with_capacity(p_max * n);
    for (r, i) in pairs {
        re.extend_from_slice(&r);
        im.extend_from_slice(&i);
    }
    WasmComplexSpectrum { re, im }
}

/// Evaluate a recovered polynomial coefficient curve along one chosen
/// derivative axis, holding the other axes at the powers in `fixed`.
/// `monomial_powers_concat` is row-major (n_monomials × n_axes) u32 packed.
#[wasm_bindgen(js_name = polyEvaluateCurveOnAxis)]
pub fn poly_evaluate_curve_on_axis_wasm(
    coeffs: &[f32],
    monomial_powers_concat: &[u32],
    n_axes: usize,
    target_axis: usize,
    fixed: &[u32],
    x_values: &[f32],
) -> Vec<f32> {
    let n_mono = coeffs.len();
    if monomial_powers_concat.len() != n_mono * n_axes {
        return vec![0.0; x_values.len()];
    }
    let powers: Vec<Vec<u32>> = (0..n_mono)
        .map(|i| monomial_powers_concat[i * n_axes..(i + 1) * n_axes].to_vec())
        .collect();
    poly_regression::evaluate_curve_on_axis(coeffs, &powers, target_axis, fixed, x_values)
}
