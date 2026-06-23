use serde::Serialize;

pub const UIA_PILOT_METHOD: &str = "windows_uia_text_pattern";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UiaPilotStatus {
    pub available: bool,
    pub capture_supported: bool,
    pub replacement_supported: bool,
    pub platform: &'static str,
    pub method: &'static str,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UiaSelectedText {
    pub text: String,
    pub focused_control: bool,
}

pub fn status() -> UiaPilotStatus {
    platform_status()
}

pub fn try_capture_selected_text() -> Result<UiaSelectedText, String> {
    platform_try_capture_selected_text()
}

#[cfg(windows)]
mod platform {
    use std::{ffi::c_void, ptr};

    const MAX_UIA_CAPTURE_CHARS: i32 = 20_001;

    use windows_sys::{
        Win32::{
            Foundation::{HWND, RPC_E_CHANGED_MODE, S_FALSE, S_OK, SysFreeString, SysStringLen},
            System::{
                Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoUninitialize, SAFEARRAY},
                Ole::{
                    SafeArrayDestroy, SafeArrayGetDim, SafeArrayGetElement, SafeArrayGetLBound,
                    SafeArrayGetUBound,
                },
            },
            UI::{
                Accessibility::{
                    HUIANODE, HUIAPATTERNOBJECT, HUIATEXTRANGE, TextPattern_GetSelection,
                    TextRange_GetText, UIA_TextPatternId, UiaGetPatternProvider, UiaNodeFromHandle,
                    UiaNodeRelease, UiaPatternRelease, UiaTextRangeRelease,
                },
                WindowsAndMessaging::{
                    GUITHREADINFO, GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId,
                },
            },
        },
        core::BSTR,
    };

    use super::{UIA_PILOT_METHOD, UiaPilotStatus, UiaSelectedText};

    pub fn status() -> UiaPilotStatus {
        UiaPilotStatus {
            available: true,
            capture_supported: true,
            replacement_supported: false,
            platform: "windows",
            method: UIA_PILOT_METHOD,
            reason: "Windows UI Automation TextPattern capture pilot is available; replacement still uses clipboard paste fallback.".to_owned(),
        }
    }

    pub fn try_capture_selected_text() -> Result<UiaSelectedText, String> {
        let _apartment = ComApartment::initialize()?;
        let focused = focused_control_window().ok_or_else(|| {
            "No focused Windows control was available for UI Automation.".to_owned()
        })?;
        let node = UiaNode::from_window(focused.hwnd)?;
        let text_pattern = UiaPattern::from_node(&node, UIA_TextPatternId)?;
        let selection = SafeArrayHandle::from_text_selection(&text_pattern)?;
        let range = selection.first_text_range()?;
        let text = range.text(MAX_UIA_CAPTURE_CHARS)?;
        if text.trim().is_empty() {
            return Err("UI Automation exposed an empty selected text range.".to_owned());
        }
        Ok(UiaSelectedText {
            text,
            focused_control: focused.from_child_control,
        })
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
                    "Focused control does not support UI Automation TextPattern: 0x{hr:08X}"
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

    struct SafeArrayHandle(*mut SAFEARRAY);

    impl SafeArrayHandle {
        fn from_text_selection(pattern: &UiaPattern) -> Result<Self, String> {
            let mut selection = ptr::null_mut();
            let hr = unsafe { TextPattern_GetSelection(pattern.0, &mut selection) };
            if succeeded(hr) && !selection.is_null() {
                Ok(Self(selection))
            } else {
                Err(format!(
                    "UI Automation TextPattern did not expose a selected range: 0x{hr:08X}"
                ))
            }
        }

        fn first_text_range(&self) -> Result<UiaTextRange, String> {
            let dimensions = unsafe { SafeArrayGetDim(self.0) };
            if dimensions != 1 {
                return Err(
                    "UI Automation returned an unexpected selection range shape.".to_owned(),
                );
            }

            let mut lower_bound = 0;
            let mut upper_bound = 0;
            let lower_hr = unsafe { SafeArrayGetLBound(self.0, 1, &mut lower_bound) };
            let upper_hr = unsafe { SafeArrayGetUBound(self.0, 1, &mut upper_bound) };
            if !succeeded(lower_hr) || !succeeded(upper_hr) || upper_bound < lower_bound {
                return Err("UI Automation selection did not contain a text range.".to_owned());
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
                    "Could not read the UI Automation selected text range: 0x{element_hr:08X}"
                ))
            }
        }
    }

    impl Drop for SafeArrayHandle {
        fn drop(&mut self) {
            unsafe {
                SafeArrayDestroy(self.0);
            }
        }
    }

    struct UiaTextRange(HUIATEXTRANGE);

    impl UiaTextRange {
        fn text(&self, max_len: i32) -> Result<String, String> {
            let mut bstr = ptr::null();
            let hr = unsafe { TextRange_GetText(self.0, max_len, &mut bstr) };
            if succeeded(hr) && !bstr.is_null() {
                Ok(BstrHandle(bstr).to_utf16_string())
            } else {
                Err(format!(
                    "Could not read UI Automation selected text: 0x{hr:08X}"
                ))
            }
        }
    }

    impl Drop for UiaTextRange {
        fn drop(&mut self) {
            unsafe {
                UiaTextRangeRelease(self.0);
            }
        }
    }

    struct BstrHandle(BSTR);

    impl BstrHandle {
        fn to_utf16_string(&self) -> String {
            let len = unsafe { SysStringLen(self.0) } as usize;
            let slice = unsafe { std::slice::from_raw_parts(self.0, len) };
            String::from_utf16_lossy(slice)
        }
    }

    impl Drop for BstrHandle {
        fn drop(&mut self) {
            unsafe {
                SysFreeString(self.0);
            }
        }
    }

    fn succeeded(hr: i32) -> bool {
        hr >= 0
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{UIA_PILOT_METHOD, UiaPilotStatus, UiaSelectedText};

    pub fn status() -> UiaPilotStatus {
        UiaPilotStatus {
            available: false,
            capture_supported: false,
            replacement_supported: false,
            platform: "non_windows",
            method: UIA_PILOT_METHOD,
            reason: "Windows UI Automation pilot is available only on Windows.".to_owned(),
        }
    }

    pub fn try_capture_selected_text() -> Result<UiaSelectedText, String> {
        Err("Windows UI Automation pilot is available only on Windows.".to_owned())
    }
}

fn platform_status() -> UiaPilotStatus {
    platform::status()
}

fn platform_try_capture_selected_text() -> Result<UiaSelectedText, String> {
    platform::try_capture_selected_text()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_shape_is_claims_bounded() {
        let status = status();

        assert_eq!(status.method, UIA_PILOT_METHOD);
        assert!(!status.replacement_supported);
        assert!(!status.reason.trim().is_empty());
    }
}
