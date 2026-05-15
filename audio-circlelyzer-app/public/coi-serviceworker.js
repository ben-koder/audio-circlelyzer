/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === "undefined") {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then((clients) => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;

        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request =
            coepCredentialless && r.mode === "no-cors"
                ? new Request(r, { credentials: "omit" })
                : r;

        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set(
                        "Cross-Origin-Embedder-Policy",
                        coepCredentialless ? "credentialless" : "require-corp"
                    );
                    if (!coepCredentialless) {
                        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
                    }
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });
} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrading = reloadedBySelf === "coepdegrade";

        // You can override defaults via a global `window.coi` object before this script runs.
        const coi = {
            shouldRegister: () => !reloadedBySelf,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi,
        };

        const n = navigator;
        const controlling = n.serviceWorker && n.serviceWorker.controller;

        // Record failure so we can degrade COEP on next load if needed.
        if (controlling && !window.crossOriginIsolated) {
            window.sessionStorage.setItem("coiCoepHasFailed", "true");
        }
        const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

        if (controlling) {
            const reloadToDegrade =
                coi.coepDegrade() && !(coepDegrading || window.crossOriginIsolated);

            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value:
                    reloadToDegrade || (coepHasFailed && coi.coepDegrade())
                        ? false
                        : coi.coepCredentialless(),
            });

            if (reloadToDegrade) {
                !coi.quiet && console.log("Reloading page to degrade COEP.");
                window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
                coi.doReload("coepdegrade");
            }

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // Already cross-origin isolated (e.g. headers set server-side), or opted out — nothing to do.
        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet &&
                console.log(
                    "COOP/COEP Service Worker not registered, a secure context is required."
                );
            return;
        }

        if (!n.serviceWorker) {
            !coi.quiet &&
                console.error(
                    "COOP/COEP Service Worker not registered, perhaps due to private browsing mode."
                );
            return;
        }

        // Register this script itself as the service worker.
        // `currentScript.src` resolves the correct absolute URL regardless of base href.
        n.serviceWorker.register(window.document.currentScript.src).then(
            (registration) => {
                !coi.quiet &&
                    console.log("COOP/COEP Service Worker registered", registration.scope);

                registration.addEventListener("updatefound", () => {
                    !coi.quiet &&
                        console.log(
                            "Reloading page to make use of updated COOP/COEP Service Worker."
                        );
                    window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
                    coi.doReload();
                });

                // SW was installed (e.g. on a previous visit) but isn't controlling this page yet.
                // A reload is the only way to bring it into control.
                if (registration.active && !n.serviceWorker.controller) {
                    !coi.quiet &&
                        console.log(
                            "Reloading page to make use of COOP/COEP Service Worker."
                        );
                    window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
                    coi.doReload();
                }
            },
            (err) => {
                !coi.quiet &&
                    console.error("COOP/COEP Service Worker failed to register:", err);
            }
        );
    })();
}
