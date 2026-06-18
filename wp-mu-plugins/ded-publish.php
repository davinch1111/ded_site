<?php
/**
 * DED Publish to Live
 *
 * Adds a "Publish to live site" button to the WP admin bar that POSTs to a
 * Cloudflare Pages deploy hook, triggering a rebuild of the static Astro site.
 *
 * The deploy-hook URL is a secret. It is entered through Settings → Publish to
 * Live and stored in a wp_option. It is NEVER hardcoded in this file and must
 * never be committed anywhere.
 *
 * - Gated to manage_options (admin bar node, settings page, trigger handler).
 * - Uses wp_remote_post() to fire the hook.
 * - Shows a success/failure admin notice after a click.
 * - Records and displays a "last triggered" timestamp.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const DED_PUBLISH_OPTION   = 'ded_publish_hook_url';        // secret deploy-hook URL
const DED_PUBLISH_LAST_OPT = 'ded_publish_last_triggered';  // unix ts of last trigger
const DED_PUBLISH_ACTION   = 'ded_publish_live';            // admin-post action / nonce

/**
 * Settings page under Settings → Publish to Live.
 */
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

/**
 * Only accept an https URL; blank clears the setting.
 */
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
		“Publish to live site” button in the toolbar POSTs to this URL and
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

/**
 * Admin bar button.
 */
add_action( 'admin_bar_menu', function ( $bar ) {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$url  = get_option( DED_PUBLISH_OPTION, '' );
	$last = (int) get_option( DED_PUBLISH_LAST_OPT, 0 );

	// With a hook set, the button fires the trigger handler. Without one, it
	// sends the admin to the settings page to add the URL first.
	$href = $url
		? wp_nonce_url( admin_url( 'admin-post.php?action=' . DED_PUBLISH_ACTION ), DED_PUBLISH_ACTION )
		: admin_url( 'options-general.php?page=ded-publish' );

	$bar->add_node( [
		'id'    => 'ded-publish',
		'title' => '<span class="ab-icon dashicons dashicons-upload" style="top:2px;"></span>Publish to live site',
		'href'  => $href,
		'meta'  => [
			'title' => $last ? 'Last triggered: ' . ded_publish_format_time( $last ) : 'Not yet triggered',
		],
	] );

	// Submenu line showing the last trigger time / a prompt to configure.
	$bar->add_node( [
		'parent' => 'ded-publish',
		'id'     => 'ded-publish-last',
		'title'  => $url
			? 'Last build: ' . ded_publish_format_time( $last )
			: 'Set the deploy hook URL first →',
		'href'   => admin_url( 'options-general.php?page=ded-publish' ),
	] );
}, 100 );

/**
 * Trigger handler: POSTs to the deploy hook, records the timestamp, and queues
 * a notice for the next admin page load.
 */
add_action( 'admin_post_' . DED_PUBLISH_ACTION, 'ded_publish_handle' );
function ded_publish_handle() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Insufficient permissions.', 403 );
	}
	check_admin_referer( DED_PUBLISH_ACTION );

	$url  = get_option( DED_PUBLISH_OPTION, '' );
	$back = wp_get_referer() ?: admin_url();

	if ( ! $url ) {
		ded_publish_set_notice( 'error', 'No deploy hook URL is set. Add one under Settings → Publish to Live.' );
		wp_safe_redirect( admin_url( 'options-general.php?page=ded-publish' ) );
		exit;
	}

	$resp = wp_remote_post( $url, [
		'timeout' => 20,
		'body'    => '', // Cloudflare deploy hooks need no payload
	] );

	if ( is_wp_error( $resp ) ) {
		ded_publish_set_notice( 'error', 'Deploy failed: ' . $resp->get_error_message() );
	} else {
		$code = (int) wp_remote_retrieve_response_code( $resp );
		if ( $code >= 200 && $code < 300 ) {
			update_option( DED_PUBLISH_LAST_OPT, time(), false );
			ded_publish_set_notice( 'success', 'Build triggered — Cloudflare is rebuilding the live site. It usually goes live within a couple of minutes.' );
		} else {
			ded_publish_set_notice( 'error', 'Deploy hook returned HTTP ' . $code . '. Check the URL under Settings → Publish to Live.' );
		}
	}

	wp_safe_redirect( $back );
	exit;
}

/**
 * Per-user transient notice (cleared on display).
 */
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
