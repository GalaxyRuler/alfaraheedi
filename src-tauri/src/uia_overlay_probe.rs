use serde::Serialize;

pub const UIA_OVERLAY_PROBE_METHOD: &str = "windows_uia_overlay_probe";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OverlaySupport {
    Supported,
    Fallback,
    Blocked,
    Unsafe,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OverlayRect {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DesktopOverlayProbe {
    pub available: bool,
    pub platform: &'static str,
    pub method: &'static str,
    pub support: OverlaySupport,
    pub reason: String,
    pub focused_control: bool,
    pub text_pattern_supported: bool,
    pub visible_range_rect_count: usize,
    pub visible_range_rects: Vec<OverlayRect>,
    pub value_pattern_supported: bool,
    pub replacement_supported: bool,
    pub control_class: Option<String>,
    pub monitor_present: bool,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct MonitorWorkArea {
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

impl DesktopOverlayProbe {
    fn unavailable(platform: &'static str, reason: impl Into<String>) -> Self {
        Self {
            available: false,
            platform,
            method: UIA_OVERLAY_PROBE_METHOD,
            support: OverlaySupport::Blocked,
            reason: reason.into(),
            focused_control: false,
            text_pattern_supported: false,
            visible_range_rect_count: 0,
            visible_range_rects: Vec::new(),
            value_pattern_supported: false,
            replacement_supported: false,
            control_class: None,
            monitor_present: false,
        }
    }

    #[cfg(test)]
    pub fn fixture_for_tests(support: OverlaySupport) -> Self {
        Self {
            available: true,
            platform: "windows",
            method: UIA_OVERLAY_PROBE_METHOD,
            support,
            reason: "Fixture contains public-safe probe metadata only.".to_owned(),
            focused_control: true,
            text_pattern_supported: true,
            visible_range_rect_count: 1,
            visible_range_rects: vec![OverlayRect {
                left: 10.0,
                top: 20.0,
                width: 160.0,
                height: 24.0,
            }],
            value_pattern_supported: true,
            replacement_supported: false,
            control_class: Some("Edit".to_owned()),
            monitor_present: true,
        }
    }
}

pub fn probe() -> DesktopOverlayProbe {
    platform_probe()
}

fn classify_support_for_rects(
    text_pattern_supported: bool,
    rectangles: &[OverlayRect],
    control_class: Option<&str>,
    password_style: bool,
    monitor_work_area: Option<&MonitorWorkArea>,
) -> OverlaySupport {
    if password_style || control_class.is_some_and(is_sensitive_control_class) {
        OverlaySupport::Unsafe
    } else if text_pattern_supported
        && monitor_work_area.is_some()
        && control_class.is_some_and(is_allowlisted_native_text_control_class)
        && rectangles
            .iter()
            .any(|rect| monitor_work_area.is_some_and(|area| rect_intersects_work_area(rect, area)))
    {
        OverlaySupport::Supported
    } else {
        OverlaySupport::Fallback
    }
}

fn is_sensitive_control_class(control_class: &str) -> bool {
    let normalized = control_class.to_ascii_lowercase();
    normalized.contains("password")
        || normalized.contains("credential")
        || normalized.contains("secure")
        || normalized == "pin"
}

fn is_allowlisted_native_text_control_class(control_class: &str) -> bool {
    let normalized = control_class.to_ascii_lowercase();
    normalized == "edit"
        || normalized.contains("richedit")
        || normalized.starts_with("windowsforms10.edit")
}

fn is_valid_overlay_rect(rect: &OverlayRect) -> bool {
    rect.left.is_finite()
        && rect.top.is_finite()
        && rect.width.is_finite()
        && rect.height.is_finite()
        && rect.width > 0.0
        && rect.height > 0.0
}

fn rect_intersects_work_area(rect: &OverlayRect, area: &MonitorWorkArea) -> bool {
    if !is_valid_overlay_rect(rect) {
        return false;
    }

    let right = rect.left + rect.width;
    let bottom = rect.top + rect.height;
    right > area.left && rect.left < area.right && bottom > area.top && rect.top < area.bottom
}

fn sanitize_overlay_rectangles(rectangles: Vec<OverlayRect>) -> Vec<OverlayRect> {
    rectangles
        .into_iter()
        .filter(is_valid_overlay_rect)
        .collect()
}

#[cfg(windows)]
mod platform {
    use std::{ffi::c_void, ptr};

    use windows_sys::Win32::{
        Foundation::{HWND, RPC_E_CHANGED_MODE, S_FALSE, S_OK},
        Graphics::Gdi::{GetMonitorInfoW, MONITOR_DEFAULTTONULL, MONITORINFO, MonitorFromWindow},
        System::{
            Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize, SAFEARRAY},
            Ole::{
                SafeArrayDestroy, SafeArrayGetDim, SafeArrayGetElement, SafeArrayGetLBound,
                SafeArrayGetUBound,
            },
        },
        UI::{
            Accessibility::{
                HUIANODE, HUIAPATTERNOBJECT, HUIATEXTRANGE, TextPattern_GetVisibleRanges,
                TextRange_GetBoundingRectangles, UIA_TextPatternId, UIA_ValuePatternId,
                UiaGetPatternProvider, UiaNodeFromHandle, UiaNodeRelease, UiaPatternRelease,
                UiaTextRangeRelease,
            },
            WindowsAndMessaging::{
                ES_PASSWORD, GUITHREADINFO, GWL_STYLE, GetClassNameW, GetForegroundWindow,
                GetGUIThreadInfo, GetWindowLongPtrW, GetWindowThreadProcessId,
            },
        },
    };

    use super::{
        DesktopOverlayProbe, MonitorWorkArea, OverlayRect, OverlaySupport, UIA_OVERLAY_PROBE_METHOD,
    };

    pub fn probe() -> DesktopOverlayProbe {
        let Ok(_apartment) = ComApartment::initialize() else {
            return DesktopOverlayProbe::unavailable(
                "windows",
                "Could not initialize COM for UI Automation overlay probing.",
            );
        };

        let Some(focused) = focused_control_window() else {
            return DesktopOverlayProbe::unavailable(
                "windows",
                "No focused Windows control was available for overlay probing.",
            );
        };
        let class_name = window_class_name(focused.hwnd);
        let monitor_work_area = monitor_work_area(focused.hwnd);
        let monitor_present = monitor_work_area.is_some();
        let password_style = has_password_style(focused.hwnd);
        let Ok(node) = UiaNode::from_window(focused.hwnd) else {
            return DesktopOverlayProbe {
                available: true,
                platform: "windows",
                method: UIA_OVERLAY_PROBE_METHOD,
                support: OverlaySupport::Fallback,
                reason: "Focused control did not expose a UI Automation node.".to_owned(),
                focused_control: focused.from_child_control,
                text_pattern_supported: false,
                visible_range_rect_count: 0,
                visible_range_rects: Vec::new(),
                value_pattern_supported: false,
                replacement_supported: false,
                control_class: class_name,
                monitor_present,
            };
        };

        let text_pattern = UiaPattern::from_node(&node, UIA_TextPatternId).ok();
        let value_pattern_supported = UiaPattern::from_node(&node, UIA_ValuePatternId).is_ok();
        let visible_range_rects =
            super::sanitize_overlay_rectangles(visible_range_rectangles(text_pattern.as_ref()));
        let support = super::classify_support_for_rects(
            text_pattern.is_some(),
            &visible_range_rects,
            class_name.as_deref(),
            password_style,
            monitor_work_area.as_ref(),
        );
        let reason = match support {
            OverlaySupport::Supported => {
                "Focused control exposes UI Automation TextPattern visible range rectangles."
            }
            OverlaySupport::Fallback => {
                "Focused control is detectable, but overlay rectangles are unavailable."
            }
            OverlaySupport::Blocked => "Focused control cannot be probed for desktop overlay.",
            OverlaySupport::Unsafe => "Focused control is unsafe for desktop overlay.",
        };

        DesktopOverlayProbe {
            available: true,
            platform: "windows",
            method: UIA_OVERLAY_PROBE_METHOD,
            support,
            reason: reason.to_owned(),
            focused_control: focused.from_child_control,
            text_pattern_supported: text_pattern.is_some(),
            visible_range_rect_count: visible_range_rects.len(),
            visible_range_rects,
            value_pattern_supported,
            replacement_supported: false,
            control_class: class_name,
            monitor_present,
        }
    }

    fn visible_range_rectangles(text_pattern: Option<&UiaPattern>) -> Vec<OverlayRect> {
        let Some(text_pattern) = text_pattern else {
            return Vec::new();
        };
        let Ok(ranges) = VisibleRangeArray::from_text_pattern(text_pattern) else {
            return Vec::new();
        };
        let Ok(range) = ranges.first_text_range() else {
            return Vec::new();
        };

        range.bounding_rectangles().unwrap_or_default()
    }

    struct FocusedWindow {
        hwnd: HWND,
        from_child_control: bool,
    }

    fn focused_control_window() -> Option<FocusedWindow> {
        unsafe {
            let foreground = GetForegroundWindow();
            if foreground.is_null() {
                return None;
            }
            let foreground_thread = GetWindowThreadProcessId(foreground, ptr::null_mut());
            if foreground_thread == 0 {
                return Some(FocusedWindow {
                    hwnd: foreground,
                    from_child_control: false,
                });
            }

            let mut info = GUITHREADINFO {
                cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
                ..Default::default()
            };
            if GetGUIThreadInfo(foreground_thread, &mut info) != 0 && !info.hwndFocus.is_null() {
                return Some(FocusedWindow {
                    hwnd: info.hwndFocus,
                    from_child_control: true,
                });
            }

            Some(FocusedWindow {
                hwnd: foreground,
                from_child_control: false,
            })
        }
    }

    fn window_class_name(hwnd: HWND) -> Option<String> {
        let mut class_name = [0u16; 128];
        let written =
            unsafe { GetClassNameW(hwnd, class_name.as_mut_ptr(), class_name.len() as i32) };
        (written > 0).then(|| String::from_utf16_lossy(&class_name[..written as usize]))
    }

    fn monitor_work_area(hwnd: HWND) -> Option<MonitorWorkArea> {
        let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL) };
        if monitor.is_null() {
            return None;
        }

        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        let ok = unsafe { GetMonitorInfoW(monitor, &mut info) };
        if ok == 0 {
            return None;
        }

        Some(MonitorWorkArea {
            left: info.rcWork.left as f64,
            top: info.rcWork.top as f64,
            right: info.rcWork.right as f64,
            bottom: info.rcWork.bottom as f64,
        })
    }

    fn has_password_style(hwnd: HWND) -> bool {
        let style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
        (style & ES_PASSWORD as isize) != 0
    }

    struct ComApartment {
        should_uninitialize: bool,
    }

    impl ComApartment {
        fn initialize() -> Result<Self, String> {
            let hr = unsafe { CoInitializeEx(ptr::null(), COINIT_APARTMENTTHREADED as u32) };
            match hr {
                S_OK | S_FALSE => Ok(Self {
                    should_uninitialize: true,
                }),
                RPC_E_CHANGED_MODE => Ok(Self {
                    should_uninitialize: false,
                }),
                _ if succeeded(hr) => Ok(Self {
                    should_uninitialize: true,
                }),
                _ => Err(format!(
                    "Could not initialize COM for UI Automation: 0x{hr:08X}"
                )),
            }
        }
    }

    impl Drop for ComApartment {
        fn drop(&mut self) {
            if self.should_uninitialize {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }

    struct UiaNode(HUIANODE);

    impl UiaNode {
        fn from_window(hwnd: HWND) -> Result<Self, String> {
            let mut node = ptr::null_mut();
            let hr = unsafe { UiaNodeFromHandle(hwnd, &mut node) };
            if succeeded(hr) && !node.is_null() {
                Ok(Self(node))
            } else {
                Err(format!(
                    "Focused control did not expose a UI Automation node: 0x{hr:08X}"
                ))
            }
        }
    }

    impl Drop for UiaNode {
        fn drop(&mut self) {
            unsafe {
                UiaNodeRelease(self.0);
            }
        }
    }

    struct UiaPattern(HUIAPATTERNOBJECT);

    impl UiaPattern {
        fn from_node(node: &UiaNode, pattern_id: i32) -> Result<Self, String> {
            let mut pattern = ptr::null_mut();
            let hr = unsafe { UiaGetPatternProvider(node.0, pattern_id, &mut pattern) };
            if succeeded(hr) && !pattern.is_null() {
                Ok(Self(pattern))
            } else {
                Err(format!(
                    "Focused control does not support UI Automation pattern {pattern_id}: 0x{hr:08X}"
                ))
            }
        }
    }

    impl Drop for UiaPattern {
        fn drop(&mut self) {
            unsafe {
                UiaPatternRelease(self.0);
            }
        }
    }

    struct VisibleRangeArray(*mut SAFEARRAY);

    impl VisibleRangeArray {
        fn from_text_pattern(pattern: &UiaPattern) -> Result<Self, String> {
            let mut ranges = ptr::null_mut();
            let hr = unsafe { TextPattern_GetVisibleRanges(pattern.0, &mut ranges) };
            if succeeded(hr) && !ranges.is_null() {
                Ok(Self(ranges))
            } else {
                Err(format!(
                    "UI Automation TextPattern did not expose visible ranges: 0x{hr:08X}"
                ))
            }
        }

        fn first_text_range(&self) -> Result<UiaTextRange, String> {
            let dimensions = unsafe { SafeArrayGetDim(self.0) };
            if dimensions != 1 {
                return Err("UI Automation returned an unexpected visible range shape.".to_owned());
            }

            let mut lower_bound = 0;
            let mut upper_bound = 0;
            let lower_hr = unsafe { SafeArrayGetLBound(self.0, 1, &mut lower_bound) };
            let upper_hr = unsafe { SafeArrayGetUBound(self.0, 1, &mut upper_bound) };
            if !succeeded(lower_hr) || !succeeded(upper_hr) || upper_bound < lower_bound {
                return Err("UI Automation visible ranges did not contain a text range.".to_owned());
            }

            let mut range = ptr::null_mut::<c_void>();
            let element_hr = unsafe {
                SafeArrayGetElement(
                    self.0,
                    &lower_bound,
                    &mut range as *mut *mut c_void as *mut c_void,
                )
            };
            if succeeded(element_hr) && !range.is_null() {
                Ok(UiaTextRange(range))
            } else {
                Err(format!(
                    "Could not read the UI Automation visible text range: 0x{element_hr:08X}"
                ))
            }
        }
    }

    impl Drop for VisibleRangeArray {
        fn drop(&mut self) {
            unsafe {
                SafeArrayDestroy(self.0);
            }
        }
    }

    struct UiaTextRange(HUIATEXTRANGE);

    impl UiaTextRange {
        fn bounding_rectangles(&self) -> Result<Vec<OverlayRect>, String> {
            let mut raw_rectangles = ptr::null_mut();
            let hr = unsafe { TextRange_GetBoundingRectangles(self.0, &mut raw_rectangles) };
            if !succeeded(hr) || raw_rectangles.is_null() {
                return Err(format!(
                    "Could not read UI Automation visible range rectangles: 0x{hr:08X}"
                ));
            }

            BoundingRectangleArray(raw_rectangles).rectangles()
        }
    }

    impl Drop for UiaTextRange {
        fn drop(&mut self) {
            unsafe {
                UiaTextRangeRelease(self.0);
            }
        }
    }

    struct BoundingRectangleArray(*mut SAFEARRAY);

    impl BoundingRectangleArray {
        fn rectangles(&self) -> Result<Vec<OverlayRect>, String> {
            let dimensions = unsafe { SafeArrayGetDim(self.0) };
            if dimensions != 1 {
                return Err(
                    "UI Automation returned an unexpected bounding rectangle shape.".to_owned(),
                );
            }

            let mut lower_bound = 0;
            let mut upper_bound = 0;
            let lower_hr = unsafe { SafeArrayGetLBound(self.0, 1, &mut lower_bound) };
            let upper_hr = unsafe { SafeArrayGetUBound(self.0, 1, &mut upper_bound) };
            if !succeeded(lower_hr) || !succeeded(upper_hr) || upper_bound < lower_bound {
                return Ok(Vec::new());
            }

            let len = (upper_bound - lower_bound + 1) as usize;
            let mut values = Vec::with_capacity(len);
            for index in lower_bound..=upper_bound {
                let mut value = 0f64;
                let element_hr = unsafe {
                    SafeArrayGetElement(self.0, &index, &mut value as *mut f64 as *mut c_void)
                };
                if !succeeded(element_hr) {
                    return Err(format!(
                        "Could not read UI Automation rectangle value: 0x{element_hr:08X}"
                    ));
                }
                values.push(value);
            }

            Ok(values
                .chunks_exact(4)
                .map(|chunk| OverlayRect {
                    left: chunk[0],
                    top: chunk[1],
                    width: chunk[2],
                    height: chunk[3],
                })
                .collect())
        }
    }

    impl Drop for BoundingRectangleArray {
        fn drop(&mut self) {
            unsafe {
                SafeArrayDestroy(self.0);
            }
        }
    }

    fn succeeded(hr: i32) -> bool {
        hr >= 0
    }
}

#[cfg(not(windows))]
mod platform {
    use super::DesktopOverlayProbe;

    pub fn probe() -> DesktopOverlayProbe {
        DesktopOverlayProbe::unavailable(
            "non_windows",
            "Windows UI Automation overlay probing is available only on Windows.",
        )
    }
}

fn platform_probe() -> DesktopOverlayProbe {
    platform::probe()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_like_control_classes_are_unsafe_for_overlay() {
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: 10.0,
                    top: 10.0,
                    width: 120.0,
                    height: 24.0,
                }],
                Some("PasswordBox"),
                false,
                Some(&test_work_area()),
            ),
            OverlaySupport::Unsafe
        );
    }

    #[test]
    fn password_style_native_edit_controls_are_unsafe_for_overlay() {
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: 10.0,
                    top: 10.0,
                    width: 120.0,
                    height: 24.0,
                }],
                Some("Edit"),
                true,
                Some(&test_work_area()),
            ),
            OverlaySupport::Unsafe
        );
    }

    #[test]
    fn generic_browser_or_electron_classes_stay_fallback_even_with_rectangles() {
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: 10.0,
                    top: 10.0,
                    width: 120.0,
                    height: 24.0,
                }],
                Some("Chrome_RenderWidgetHostHWND"),
                false,
                Some(&test_work_area()),
            ),
            OverlaySupport::Fallback
        );
    }

    #[test]
    fn supported_requires_valid_positive_rectangles() {
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: 10.0,
                    top: 10.0,
                    width: 0.0,
                    height: 24.0,
                }],
                Some("RichEditD2DPT"),
                false,
                Some(&test_work_area()),
            ),
            OverlaySupport::Fallback
        );
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: f64::NAN,
                    top: 10.0,
                    width: 120.0,
                    height: 24.0,
                }],
                Some("RichEditD2DPT"),
                false,
                Some(&test_work_area()),
            ),
            OverlaySupport::Fallback
        );
    }

    #[test]
    fn supported_requires_monitor_work_area_intersection() {
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: 10_000.0,
                    top: 10_000.0,
                    width: 120.0,
                    height: 24.0,
                }],
                Some("RichEditD2DPT"),
                false,
                Some(&test_work_area()),
            ),
            OverlaySupport::Fallback
        );
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: 10.0,
                    top: 10.0,
                    width: 120.0,
                    height: 24.0,
                }],
                Some("RichEditD2DPT"),
                false,
                None,
            ),
            OverlaySupport::Fallback
        );
    }

    #[test]
    fn native_allowlisted_controls_with_valid_rectangles_can_be_supported() {
        assert_eq!(
            classify_support_for_rects(
                true,
                &[OverlayRect {
                    left: 10.0,
                    top: 10.0,
                    width: 120.0,
                    height: 24.0,
                }],
                Some("RichEditD2DPT"),
                false,
                Some(&test_work_area()),
            ),
            OverlaySupport::Supported
        );
    }

    #[test]
    fn serialized_probe_uses_exact_public_safe_key_allowlist() {
        let probe = DesktopOverlayProbe::fixture_for_tests(OverlaySupport::Fallback);
        let serialized = serde_json::to_value(&probe).expect("probe serializes");
        let object = serialized.as_object().expect("probe serializes as object");
        let mut keys = object.keys().map(String::as_str).collect::<Vec<_>>();
        keys.sort_unstable();

        assert_eq!(
            keys,
            [
                "available",
                "control_class",
                "focused_control",
                "method",
                "monitor_present",
                "platform",
                "reason",
                "replacement_supported",
                "support",
                "text_pattern_supported",
                "value_pattern_supported",
                "visible_range_rect_count",
                "visible_range_rects",
            ]
        );

        let raw = serde_json::to_string(&probe).expect("probe serializes");
        for forbidden in [
            "raw_text",
            "captured_text",
            "current_text",
            "selected_text",
            "clipboard_content",
            "window_title",
            "document_name",
            "مرحب",
        ] {
            assert!(
                !raw.contains(forbidden),
                "forbidden key leaked: {forbidden}"
            );
        }
    }

    fn test_work_area() -> MonitorWorkArea {
        MonitorWorkArea {
            left: 0.0,
            top: 0.0,
            right: 1920.0,
            bottom: 1080.0,
        }
    }
}
