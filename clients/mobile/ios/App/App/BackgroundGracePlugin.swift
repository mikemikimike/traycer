import Capacitor
import UIKit

/// A short hold on the app after it is sent to the background (see
/// `src/background-grace.ts`). iOS suspends the WebView soon after `pause`
/// and its timers stop with it, so the renderer cannot measure how long a
/// background lasted. This measures it natively, under a background task.
///
/// `hold({ ms })` resolves `{ backgrounded }` after `ms`, or early with
/// `backgrounded: false` when the app returns to the foreground first.
/// Resolving wakes the page to run whatever the answer gates, and the task
/// outlives the answer by `settleGrace` so that work finishes before the app
/// is suspended.
@objc(BackgroundGracePlugin)
public class BackgroundGracePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundGracePlugin"
    public let jsName = "BackgroundGrace"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "hold", returnType: CAPPluginReturnPromise),
    ]

    private struct Hold {
        let call: CAPPluginCall
        let timer: DispatchWorkItem
        let task: UIBackgroundTaskIdentifier
    }

    private let settleGrace: TimeInterval = 2
    /// Keyed by callback id; touched on the main queue only.
    private var holds: [String: Hold] = [:]

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(willEnterForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func hold(_ call: CAPPluginCall) {
        guard let ms = call.getInt("ms"), ms > 0 else {
            call.reject("ms must be a positive number of milliseconds")
            return
        }
        DispatchQueue.main.async {
            let id: String = call.callbackId
            let task = UIApplication.shared.beginBackgroundTask(withName: "BackgroundGrace") { [weak self] in
                // Out of background time: answer now and end the task at once,
                // or iOS kills the app for overrunning it.
                self?.settle(id, backgrounded: Self.isBackgrounded(), grace: 0)
            }
            let timer = DispatchWorkItem { [weak self] in
                guard let self else { return }
                self.settle(id, backgrounded: Self.isBackgrounded(), grace: self.settleGrace)
            }
            self.holds[id] = Hold(call: call, timer: timer, task: task)
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(ms), execute: timer)
        }
    }

    @objc private func willEnterForeground() {
        for id in Array(holds.keys) {
            settle(id, backgrounded: false, grace: 0)
        }
    }

    private func settle(_ id: String, backgrounded: Bool, grace: TimeInterval) {
        guard let hold = holds.removeValue(forKey: id) else { return }
        hold.timer.cancel()
        hold.call.resolve(["backgrounded": backgrounded])
        guard hold.task != .invalid else { return }
        if grace <= 0 {
            UIApplication.shared.endBackgroundTask(hold.task)
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + grace) {
            UIApplication.shared.endBackgroundTask(hold.task)
        }
    }

    private static func isBackgrounded() -> Bool {
        return UIApplication.shared.applicationState == .background
    }
}
