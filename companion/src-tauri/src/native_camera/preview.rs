//! Native AVFoundation preview hosted directly in the WKWebView layer tree.
//!
//! Only layout metadata crosses Tauri IPC. Camera pixels stay in AVFoundation
//! and are never serialized into JavaScript, copied into a data URL, or emitted
//! as an event.

use objc2::{msg_send, rc::Retained, runtime::AnyObject};
use objc2_av_foundation::{
    AVCaptureSession, AVCaptureVideoPreviewLayer, AVLayerVideoGravityResizeAspectFill,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_foundation::NSString;
use objc2_quartz_core::{CALayer, CAMediaTimingFunction, CATransaction};
use serde::Deserialize;
use tauri::{AppHandle, Manager};

const PREVIEW_LAYER_NAME: &str = "at.eudonomia.native-camera-preview";
/// Length of a mini/full size change. Core Animation runs it on the render
/// server, so the layer moves in step with the display instead of trailing
/// the WebView through one IPC round trip per frame.
const RESIZE_DURATION_SECONDS: f64 = 0.26;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeCameraPreviewBounds {
    right: f64,
    bottom: f64,
    width: f64,
    height: f64,
    visible: bool,
    corner_radius: f64,
    /// Animate to these bounds instead of jumping. Sent once per user size
    /// change; every other update (window resize, reattach) still jumps.
    #[serde(default)]
    animate: bool,
}

impl NativeCameraPreviewBounds {
    fn is_drawable(self) -> bool {
        self.visible
            && self.right.is_finite()
            && self.bottom.is_finite()
            && self.width.is_finite()
            && self.height.is_finite()
            && self.corner_radius.is_finite()
            && self.right >= 0.0
            && self.bottom >= 0.0
            && self.width >= 1.0
            && self.height >= 1.0
    }

    fn layer_origin(self, geometry_flipped: bool, root_bounds: CGRect) -> CGPoint {
        let x = root_bounds.origin.x + root_bounds.size.width - self.right - self.width;
        let y = if geometry_flipped {
            root_bounds.origin.y + root_bounds.size.height - self.bottom - self.height
        } else {
            root_bounds.origin.y + self.bottom
        };
        CGPoint::new(x, y)
    }
}

pub(super) fn attach(app: &AppHandle, session: Retained<AVCaptureSession>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main WebView is unavailable".to_string())?;
    // Retained<T> is deliberately not sent between threads. Transfer one +1
    // retain count as an integer and reconstruct it inside Tauri's main-thread
    // WebView callback.
    let session_ptr = Retained::into_raw(session) as usize;
    let result = window.with_webview(move |webview| unsafe {
        let Some(session) = Retained::from_raw(session_ptr as *mut AVCaptureSession) else {
            return;
        };
        let view: &AnyObject = &*webview.inner().cast();
        let root_ptr: *mut CALayer = msg_send![view, layer];
        let Some(root) = root_ptr.as_ref() else {
            return;
        };

        remove_from(root);
        let preview = AVCaptureVideoPreviewLayer::layerWithSession(&session);
        if let Some(gravity) = AVLayerVideoGravityResizeAspectFill {
            preview.setVideoGravity(gravity);
        }
        preview.setName(Some(&NSString::from_str(PREVIEW_LAYER_NAME)));
        preview.setMasksToBounds(true);
        preview.setZPosition(1_000.0);
        preview.setHidden(true);
        root.addSublayer(&preview);
    });
    if let Err(error) = result {
        // The callback did not take ownership when dispatching failed.
        unsafe { drop(Retained::from_raw(session_ptr as *mut AVCaptureSession)) };
        return Err(error.to_string());
    }
    Ok(())
}

pub(super) fn update(app: &AppHandle, bounds: NativeCameraPreviewBounds) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main WebView is unavailable".to_string())?;
    window
        .with_webview(move |webview| unsafe {
            let view: &AnyObject = &*webview.inner().cast();
            let root_ptr: *mut CALayer = msg_send![view, layer];
            let Some(root) = root_ptr.as_ref() else {
                return;
            };
            let Some(preview) = find_in(root) else {
                return;
            };

            CATransaction::begin();
            if bounds.animate && bounds.is_drawable() && !preview.isHidden() {
                CATransaction::setAnimationDuration(RESIZE_DURATION_SECONDS);
                // Same curve as the app's sidebar: accelerates and settles evenly.
                CATransaction::setAnimationTimingFunction(Some(
                    &CAMediaTimingFunction::functionWithControlPoints(0.4, 0.0, 0.2, 1.0),
                ));
            } else {
                CATransaction::setDisableActions(true);
            }
            if bounds.is_drawable() {
                // The placeholder is fixed to the bottom-right corner. Anchor
                // the native layer to those shared edges too, avoiding every
                // title-bar/safe-area difference at the top of WKWebView.
                let origin = bounds.layer_origin(root.isGeometryFlipped(), root.bounds());
                preview.setFrame(CGRect::new(
                    origin,
                    CGSize::new(bounds.width, bounds.height),
                ));
                preview.setCornerRadius(bounds.corner_radius.max(0.0));
                preview.setHidden(false);
            } else {
                preview.setHidden(true);
            }
            CATransaction::commit();
        })
        .map_err(|error| error.to_string())
}

pub(super) fn remove(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| unsafe {
        let view: &AnyObject = &*webview.inner().cast();
        let root_ptr: *mut CALayer = msg_send![view, layer];
        if let Some(root) = root_ptr.as_ref() {
            remove_from(root);
        }
    });
}

fn find_in(root: &CALayer) -> Option<Retained<CALayer>> {
    let name = unsafe { root.sublayers() }?;
    name.iter().find(|layer| {
        layer
            .name()
            .is_some_and(|value| value.to_string() == PREVIEW_LAYER_NAME)
    })
}

fn remove_from(root: &CALayer) {
    if let Some(layer) = find_in(root) {
        layer.removeFromSuperlayer();
    }
}

#[cfg(test)]
mod tests {
    use super::NativeCameraPreviewBounds;
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};

    #[test]
    fn preview_requires_real_visible_bounds() {
        assert!(NativeCameraPreviewBounds {
            right: 28.0,
            bottom: 80.0,
            width: 160.0,
            height: 120.0,
            visible: true,
            corner_radius: 8.0,
            animate: false,
        }
        .is_drawable());
        let bounds = NativeCameraPreviewBounds {
            right: 28.0,
            bottom: 80.0,
            width: 160.0,
            height: 120.0,
            visible: true,
            corner_radius: 8.0,
            animate: false,
        };
        let root = CGRect::new(CGPoint::ZERO, CGSize::new(1_000.0, 830.0));
        assert_eq!(bounds.layer_origin(false, root), CGPoint::new(812.0, 80.0));
        assert_eq!(bounds.layer_origin(true, root), CGPoint::new(812.0, 630.0));
        assert!(!NativeCameraPreviewBounds {
            right: 28.0,
            bottom: 80.0,
            width: 0.0,
            height: 120.0,
            visible: true,
            corner_radius: 8.0,
            animate: false,
        }
        .is_drawable());
        assert!(!NativeCameraPreviewBounds {
            right: 28.0,
            bottom: 80.0,
            width: 160.0,
            height: 120.0,
            visible: false,
            corner_radius: 8.0,
            animate: false,
        }
        .is_drawable());
    }

    #[test]
    fn older_callers_without_animate_still_jump() {
        let bounds: NativeCameraPreviewBounds = serde_json::from_str(
            r#"{"right":28,"bottom":80,"width":160,"height":120,"visible":true,"cornerRadius":8}"#,
        )
        .expect("bounds without animate deserialize");
        assert!(!bounds.animate);
    }
}
