<?php
/**
 * DED Publish to Live
 *
 * Adds a "Publish to live site" control that POSTs to a Cloudflare Pages
 * deploy hook, triggering a rebuild of the static Astro site.
 *
 * The deploy-hook URL is a secret. It is entered through Settings → Publish to
 * Live and stored in a wp_option. It is NEVER hardcoded in this file and must
 * never be committed anywhere.
 *
 * FIRING PATH — admin-ajax.php, not admin-post.php. The All-In-One WP Security
 * firewall on this host intercepts admin-post.php requests, so admin-bar clicks
 * silently never reached the old handler. admin-ajax.php is core-critical and
 * left alone by that firewall, so the button now fires via an authenticated
 * AJAX call with inline feedback (no page redirect, works on front end + admin).
 * The old admin_post handler is kept as a no-JS fallback.
 *
 * - Gated to manage_options (admin bar node, dashboard widget, settings page,
 *   AJAX + admin-post handlers).
 * - Uses wp_remote_post() to fire the hook.
 * - Records and displays a "last triggered" timestamp.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const DED_PUBLISH_OPTION   = 'ded_publish_hook_url';        // secret deploy-hook URL
const DED_PUBLISH_LAST_OPT = 'ded_publish_last_triggered';  // unix ts of last trigger
const DED_PUBLISH_ACTION   = 'ded_publish_live';            // action slug / nonce name

/* ────────────────────────────────────────────────────────────────────────
 * Settings page — Settings → Publish to Live (hook URL entry).
 * ──────────────────────────────────────────────────────────────────────── */
add_action( 'admin_menu', function () {
	add_options_page(
		'Publish to Live',
		'Publish to Live',
		'manage_options',
		'ded-publish',
		'ded_publish_settings_page'
	);
} );

add_action( 'admin_init', function () {
	register_setting( 'ded_publish_group', DED_PUBLISH_OPTION, [
		'type'              => 'string',
		'sanitize_callback' => 'ded_publish_sanitize_url',
		'default'           => '',
		'show_in_rest'      => false, // keep the secret out of the REST API
	] );
} );

/** Only accept an https URL; blank clears the setting. */
function ded_publish_sanitize_url( $value ) {
	$value = trim( (string) $value );
	if ( '' === $value ) {
		return '';
	}
	return esc_url_raw( $value, [ 'https' ] );
}

function ded_publish_format_time( $ts ) {
	$ts = (int) $ts;
	if ( ! $ts ) {
		return 'Never';
	}
	return sprintf(
		'%s (%s ago)',
		wp_date( 'M j, Y g:i a', $ts ),
		human_time_diff( $ts, time() )
	);
}

function ded_publish_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$url  = get_option( DED_PUBLISH_OPTION, '' );
	$last = (int) get_option( DED_PUBLISH_LAST_OPT, 0 );
	?>
	<div class="wrap">
		<h1>Publish to Live</h1>
		<p>Paste the Cloudflare Pages <strong>deploy hook</strong> URL below. The
		“Publish to live site” button (toolbar + Dashboard) POSTs to this URL and
		triggers a rebuild of the live static site. The URL is stored privately
		in this site’s options &mdash; it is never printed in the page source.</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'ded_publish_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ded_publish_hook_url">Deploy hook URL</label></th>
					<td>
						<input name="<?php echo esc_attr( DED_PUBLISH_OPTION ); ?>"
							id="ded_publish_hook_url" type="url" class="regular-text code"
							autocomplete="off"
							value="<?php echo esc_attr( $url ); ?>"
							placeholder="https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/&hellip;" />
						<p class="description">
							Cloudflare → Workers &amp; Pages → <strong>ded-site</strong> →
							Settings → Builds &amp; deployments → <strong>Deploy hooks</strong> →
							create a hook, copy its URL.
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Last triggered</th>
					<td><?php echo $last ? esc_html( ded_publish_format_time( $last ) ) : '<em>Never</em>'; ?></td>
				</tr>
			</table>
			<?php submit_button( 'Save hook URL' ); ?>
		</form>
	</div>
	<?php
}

/* ────────────────────────────────────────────────────────────────────────
 * Shared fire routine — single source of truth for both handlers.
 * Returns [ ok(bool), code(int), msg(string) ]. Updates the timestamp on 2xx.
 * ──────────────────────────────────────────────────────────────────────── */
function ded_publish_fire() {
	$url = get_option( DED_PUBLISH_OPTION, '' );
	if ( ! $url ) {
		return [ 'ok' => false, 'code' => 0, 'msg' => 'No deploy hook URL is set. Add one under Settings → Publish to Live.' ];
	}
	$resp = wp_remote_post( $url, [
		'timeout' => 20,
		'body'    => '', // Cloudflare deploy hooks need no payload
	] );
	if ( is_wp_error( $resp ) ) {
		return [ 'ok' => false, 'code' => 0, 'msg' => 'Deploy failed: ' . $resp->get_error_message() ];
	}
	$code = (int) wp_remote_retrieve_response_code( $resp );
	if ( $code >= 200 && $code < 300 ) {
		update_option( DED_PUBLISH_LAST_OPT, time(), false );
		return [ 'ok' => true, 'code' => $code, 'msg' => 'Build triggered — Cloudflare is rebuilding the live site. It usually goes live within a couple of minutes.' ];
	}
	return [ 'ok' => false, 'code' => $code, 'msg' => 'Deploy hook returned HTTP ' . $code . '. Check the URL under Settings → Publish to Live.' ];
}

/* ────────────────────────────────────────────────────────────────────────
 * PRIMARY firing path: admin-ajax.php (firewall-safe).
 * ──────────────────────────────────────────────────────────────────────── */
add_action( 'wp_ajax_' . DED_PUBLISH_ACTION, function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_send_json_error( [ 'msg' => 'Insufficient permissions.' ], 403 );
	}
	check_ajax_referer( DED_PUBLISH_ACTION, 'nonce' );

	$r = ded_publish_fire();
	$r['last'] = ded_publish_format_time( (int) get_option( DED_PUBLISH_LAST_OPT, 0 ) );

	if ( $r['ok'] ) {
		wp_send_json_success( $r );
	}
	wp_send_json_error( $r );
} );

/* ────────────────────────────────────────────────────────────────────────
 * FALLBACK firing path: admin-post.php (kept for no-JS; may be firewalled).
 * ──────────────────────────────────────────────────────────────────────── */
add_action( 'admin_post_' . DED_PUBLISH_ACTION, function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Insufficient permissions.', 403 );
	}
	check_admin_referer( DED_PUBLISH_ACTION );

	$r    = ded_publish_fire();
	$back = wp_get_referer() ?: admin_url();
	ded_publish_set_notice( $r['ok'] ? 'success' : 'error', $r['msg'] );
	wp_safe_redirect( $r['ok'] ? $back : admin_url( 'options-general.php?page=ded-publish' ) );
	exit;
} );

/* ────────────────────────────────────────────────────────────────────────
 * Admin-bar button. href is a no-JS fallback to the Dashboard (where the
 * widget lives); the footer JS intercepts the click to fire via AJAX.
 * ──────────────────────────────────────────────────────────────────────── */
add_action( 'admin_bar_menu', function ( $bar ) {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$url  = get_option( DED_PUBLISH_OPTION, '' );
	$last = (int) get_option( DED_PUBLISH_LAST_OPT, 0 );

	$href = $url
		? admin_url( 'index.php#ded-publish-widget' )         // JS intercepts; fallback lands on the Dashboard widget
		: admin_url( 'options-general.php?page=ded-publish' ); // no hook yet → settings

	$bar->add_node( [
		'id'    => 'ded-publish',
		'title' => '<span class="ab-icon dashicons dashicons-upload" style="top:2px;"></span>Publish to live site',
		'href'  => $href,
		'meta'  => [
			'title' => $last ? 'Last triggered: ' . ded_publish_format_time( $last ) : 'Not yet triggered',
		],
	] );

	$bar->add_node( [
		'parent' => 'ded-publish',
		'id'     => 'ded-publish-last',
		'title'  => $url
			? 'Last build: ' . ded_publish_format_time( $last )
			: 'Set the deploy hook URL first →',
		'href'   => admin_url( 'options-general.php?page=ded-publish' ),
	] );
}, 100 );

/* ────────────────────────────────────────────────────────────────────────
 * Dashboard widget — the reliable primary control (a real button on a page
 * you own, fired via AJAX with inline status).
 * ──────────────────────────────────────────────────────────────────────── */
add_action( 'wp_dashboard_setup', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	wp_add_dashboard_widget( 'ded_publish_widget', 'Publish to Live', 'ded_publish_widget_render' );
} );

function ded_publish_widget_render() {
	$url  = get_option( DED_PUBLISH_OPTION, '' );
	$last = (int) get_option( DED_PUBLISH_LAST_OPT, 0 );
	echo '<div id="ded-publish-widget">';
	if ( ! $url ) {
		printf(
			'<p>No deploy hook URL set yet. <a href="%s">Add it under Settings → Publish to Live →</a></p>',
			esc_url( admin_url( 'options-general.php?page=ded-publish' ) )
		);
		echo '</div>';
		return;
	}
	echo '<p>Push the latest WordPress content live. Cloudflare rebuilds the static site; it goes live within a couple of minutes.</p>';
	echo '<p><button type="button" class="button button-primary" id="ded-publish-now">Publish to live site</button></p>';
	printf(
		'<p class="description">Last build: <span id="ded-publish-last">%s</span></p>',
		esc_html( ded_publish_format_time( $last ) )
	);
	echo '<div id="ded-publish-widget-status" style="margin-top:8px;"></div>';
	echo '</div>';
}

/* ────────────────────────────────────────────────────────────────────────
 * Per-user transient notice (admin-post fallback path only).
 * ──────────────────────────────────────────────────────────────────────── */
function ded_publish_set_notice( $type, $msg ) {
	set_transient( 'ded_publish_notice_' . get_current_user_id(), [ 'type' => $type, 'msg' => $msg ], 60 );
}

add_action( 'admin_notices', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$key    = 'ded_publish_notice_' . get_current_user_id();
	$notice = get_transient( $key );
	if ( ! $notice ) {
		return;
	}
	delete_transient( $key );
	$class = ( 'success' === $notice['type'] ) ? 'notice-success' : 'notice-error';
	printf(
		'<div class="notice %s is-dismissible"><p>%s</p></div>',
		esc_attr( $class ),
		esc_html( $notice['msg'] )
	);
} );

/* ────────────────────────────────────────────────────────────────────────
 * Footer JS — intercepts the admin-bar button + wires the Dashboard button,
 * both firing via AJAX with an inline toast. Printed in admin AND front-end
 * footers (the admin bar shows on the front end too), gated to admins with
 * the bar visible. WP-admin context — inline scripts are fine here (this is
 * NOT the CSP-restricted Astro site).
 * ──────────────────────────────────────────────────────────────────────── */
function ded_publish_footer_js() {
	if ( ! current_user_can( 'manage_options' ) || ! is_admin_bar_showing() ) {
		return;
	}
	$cfg = [
		'ajaxUrl' => admin_url( 'admin-ajax.php' ),
		'nonce'   => wp_create_nonce( DED_PUBLISH_ACTION ),
		'action'  => DED_PUBLISH_ACTION,
		'hasHook' => (bool) get_option( DED_PUBLISH_OPTION, '' ),
	];
	?>
	<script>
	(function () {
		var cfg = <?php echo wp_json_encode( $cfg ); ?>;

		function toast(msg, ok, pending) {
			var t = document.getElementById('ded-publish-toast');
			if (!t) {
				t = document.createElement('div');
				t.id = 'ded-publish-toast';
				t.style.cssText = 'position:fixed;z-index:100000;right:20px;bottom:20px;max-width:360px;'
					+ 'padding:12px 16px;border-radius:6px;font:14px/1.5 -apple-system,system-ui,sans-serif;'
					+ 'color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.28);';
				document.body.appendChild(t);
			}
			t.style.background = pending ? '#2271b1' : (ok ? '#00844a' : '#b32d2e');
			t.textContent = msg;
			t.style.opacity = '1';
			if (!pending) {
				clearTimeout(t._hide);
				t._hide = setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 6000);
			}
		}

		function fire(btn) {
			if (btn) { btn.disabled = true; }
			toast('Publishing…', true, true);
			var body = new URLSearchParams();
			body.set('action', cfg.action);
			body.set('nonce', cfg.nonce);
			fetch(cfg.ajaxUrl, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString()
			})
			.then(function (r) { return r.json().catch(function () { return { success: false, data: { msg: 'Unexpected response (HTTP ' + r.status + ').' } }; }); })
			.then(function (j) {
				var ok = !!(j && j.success);
				var d  = (j && j.data) || {};
				toast(d.msg || (ok ? 'Build triggered.' : 'Publish failed.'), ok);
				if (ok && d.last) {
					var lastEl = document.getElementById('ded-publish-last');
					if (lastEl) { lastEl.textContent = d.last; }
				}
			})
			.catch(function (e) { toast('Publish failed: ' + e.message, false); })
			.finally(function () { if (btn) { btn.disabled = false; } });
		}

		// Admin-bar button — intercept the click, fire via AJAX.
		var ab = document.querySelector('#wp-admin-bar-ded-publish > a');
		if (ab && cfg.hasHook) {
			ab.addEventListener('click', function (e) { e.preventDefault(); fire(null); });
		}

		// Dashboard widget button.
		var wbtn = document.getElementById('ded-publish-now');
		if (wbtn) {
			wbtn.addEventListener('click', function (e) { e.preventDefault(); fire(wbtn); });
		}
	})();
	</script>
	<?php
}
add_action( 'admin_print_footer_scripts', 'ded_publish_footer_js' );
add_action( 'wp_print_footer_scripts', 'ded_publish_footer_js' );
