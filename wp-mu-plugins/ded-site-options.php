<?php
/**
 * DED Site Options
 * Site-wide settings that belong to no single post — currently the homepage
 * hero's mobile fallback image.
 *
 * WHY AN OPTIONS PAGE: the homepage hero is not a `ded_project`, so it has
 * no post to hang an ACF field group on. ACF Pro's options page gives the
 * homepage somewhere to store settings. (Requires ACF Pro — verified 6.8.3
 * on this install.)
 *
 * WHY A CUSTOM REST ROUTE: ACF options values live in wp_options, not on a
 * post, so they never appear under /wp/v2/*. This plugin exposes them at
 *   GET /wp-json/ded/v1/site-options
 * which the Astro build reads. Read-only and public — it returns nothing but
 * a public image URL that already appears on the rendered page.
 *
 * Additive: registers a page, a field group and a GET route. Touches no
 * existing content.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/* ── Options page ──────────────────────────────────────────────────── */

add_action( 'acf/init', 'ded_register_site_options_page' );
function ded_register_site_options_page() {

	if ( ! function_exists( 'acf_add_options_page' ) ) {
		return; // ACF Pro missing — degrade quietly rather than fatal.
	}

	acf_add_options_page( [
		'page_title'      => 'Site Settings',
		'menu_title'      => 'Site Settings',
		'menu_slug'       => 'ded-site-settings',
		'capability'      => 'manage_options',
		'position'        => '58.6',
		'icon_url'        => 'dashicons-admin-customizer',
		'redirect'        => false,
		'update_button'   => 'Save settings',
		'updated_message' => 'Site settings saved. Use "Publish to live site" to push them to the live site.',
	] );
}

/* ── Field group ───────────────────────────────────────────────────── */

add_action( 'acf/init', 'ded_register_site_options_fields' );
function ded_register_site_options_fields() {

	if ( ! function_exists( 'acf_add_local_field_group' ) ) {
		return;
	}

	acf_add_local_field_group( [
		'key'                   => 'group_ded_site_options',
		'title'                 => 'Homepage hero',
		'menu_order'            => 0,
		'position'              => 'normal',
		'style'                 => 'default',
		'label_placement'       => 'top',
		'instruction_placement' => 'label',
		'active'                => true,
		'show_in_rest'          => 1,
		'location'              => [
			[
				[
					'param'    => 'options_page',
					'operator' => '==',
					'value'    => 'ded-site-settings',
				],
			],
		],
		'fields' => [
			[
				'key'     => 'field_ded_hero_mobile_msg',
				'label'   => 'Mobile hero',
				'name'    => '',
				'type'    => 'message',
				'message' =>
					'The homepage hero plays a background video on tablet and desktop. ' .
					'On phones (480px wide and narrower) the video is skipped to save data, ' .
					'so without an image here those visitors see a plain dark background.',
			],
			[
				'key'           => 'field_ded_hero_mobile_image',
				'label'         => 'Mobile fallback image',
				'name'          => 'hero_mobile_image',
				'type'          => 'image',
				'return_format' => 'array',
				'preview_size'  => 'medium',
				'library'       => 'all',
				'mime_types'    => 'jpg,jpeg,png,webp',
				// Stating the required resolution is the point of this field —
				// put it where whoever uploads will actually read it.
				'instructions'  =>
					"Shown instead of the hero video on phones (480px wide and narrower).\n\n" .
					"REQUIRED SIZE: 1080 × 1920px minimum — portrait, 9:16.\n" .
					"Preferred: 1440 × 2560px, which stays sharp on high-density phone screens.\n\n" .
					"Format: JPG or WebP, under 400KB. The image is cropped from the centre to " .
					"fill the screen, and a dark gradient sits over the lower half behind the " .
					"headline — so keep the subject in the upper two thirds and avoid detail " .
					"that matters near the bottom edge.\n\n" .
					"Leave empty to keep the current plain dark hero.",
			],
			[
				'key'           => 'field_ded_hero_mobile_focus',
				'label'         => 'Focal point',
				'name'          => 'hero_mobile_focus',
				'type'          => 'select',
				'choices'       => [
					'center' => 'Centre (default)',
					'top'    => 'Top',
					'bottom' => 'Bottom',
				],
				'default_value' => 'center',
				'return_format' => 'value',
				'instructions'  => 'Which part of the image to hold in frame when it is cropped to the phone screen.',
			],
		],
	] );
}

/* ── REST ──────────────────────────────────────────────────────────── */

add_action( 'rest_api_init', 'ded_register_site_options_route' );
function ded_register_site_options_route() {

	register_rest_route( 'ded/v1', '/site-options', [
		'methods'             => WP_REST_Server::READABLE,
		'permission_callback' => '__return_true', // public: read-only, public data
		'callback'            => 'ded_get_site_options',
	] );
}

function ded_get_site_options() {

	$image = function_exists( 'get_field' ) ? get_field( 'hero_mobile_image', 'option' ) : null;
	$focus = function_exists( 'get_field' ) ? get_field( 'hero_mobile_focus', 'option' ) : null;

	$payload = [
		'hero_mobile_image' => null,
		'hero_mobile_focus' => $focus ? $focus : 'center',
	];

	// Slim ACF's full attachment blob down to what the template binds to.
	if ( is_array( $image ) && ! empty( $image['url'] ) ) {
		$payload['hero_mobile_image'] = [
			'url'    => $image['url'],
			'width'  => isset( $image['width'] ) ? (int) $image['width'] : null,
			'height' => isset( $image['height'] ) ? (int) $image['height'] : null,
			'alt'    => isset( $image['alt'] ) ? $image['alt'] : '',
		];
	}

	return rest_ensure_response( $payload );
}
