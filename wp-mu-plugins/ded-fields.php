<?php
/**
 * DED Project ACF Field Group
 * Registers the project-page field group via acf_add_local_field_group()
 * so the Astro template can bind to stable, code-defined field names.
 *
 * Field group is exposed to the REST API (show_in_rest => 1) so all values
 * land in the `acf` block of /wp-json/wp/v2/ded_project/<id>.
 *
 * Image fields use return_format=array so Astro gets URL + dimensions.
 */

add_action( 'acf/init', 'ded_register_project_fields' );
function ded_register_project_fields() {

    if ( ! function_exists( 'acf_add_local_field_group' ) ) {
        return;
    }

    acf_add_local_field_group( [
        'key'    => 'group_ded_project',
        'title'  => 'Project Details',
        'menu_order'    => 0,
        'position'      => 'normal',
        'style'         => 'default',
        'label_placement'       => 'top',
        'instruction_placement' => 'label',
        'active'        => true,
        'show_in_rest'  => 1,
        'location'      => [
            [
                [
                    'param'    => 'post_type',
                    'operator' => '==',
                    'value'    => 'ded_project',
                ],
            ],
        ],
        'fields' => [

            // Project order is now set by drag-and-drop (ASE Content Order →
            // Projects ▸ Order), stored in menu_order. The old ACF
            // display_order number field was removed.

            // ── Hero tab ──
            [ 'key' => 'field_ded_tab_hero', 'label' => 'Hero', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_hero_animate',
                'label'         => 'Animate hero',
                'name'          => 'hero_animate',
                'type'          => 'true_false',
                'default_value' => 1,
                'ui'            => 1,
            ],
            [
                'key'           => 'field_ded_master_image',
                'label'         => 'Master image',
                'name'          => 'master_image',
                'type'          => 'image',
                'return_format' => 'array',
                'preview_size'  => 'medium',
                'library'       => 'all',
            ],
            [
                'key'          => 'field_ded_hover_video',
                'label'        => 'Hover video',
                'name'         => 'hover_video',
                'type'         => 'url',
                'instructions' => 'R2-hosted MP4 that plays on hover over this project\'s homepage card. The master image above is the poster shown at rest. Leave empty for a static image card.',
            ],
            [
                'key'           => 'field_ded_project_logo',
                'label'         => 'Project logo',
                'name'          => 'project_logo',
                'type'          => 'image',
                'return_format' => 'array',
                'preview_size'  => 'medium',
                'library'       => 'all',
            ],
            [
                'key'   => 'field_ded_tagline',
                'label' => 'Tagline',
                'name'  => 'tagline',
                'type'  => 'text',
            ],

            // ── Facts tab ──
            [ 'key' => 'field_ded_tab_facts', 'label' => 'Facts', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [ 'key' => 'field_ded_fact_client',     'label' => 'Client',     'name' => 'fact_client',     'type' => 'text' ],
            [ 'key' => 'field_ded_fact_since',      'label' => 'Since',      'name' => 'fact_since',      'type' => 'text' ],
            [ 'key' => 'field_ded_fact_engagement', 'label' => 'Engagement', 'name' => 'fact_engagement', 'type' => 'text' ],
            [ 'key' => 'field_ded_fact_role',       'label' => 'Role',       'name' => 'fact_role',       'type' => 'text' ],

            // ── Brief tab ──
            [ 'key' => 'field_ded_tab_brief', 'label' => 'Brief', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_show_brief',
                'label'         => 'Show brief',
                'name'          => 'show_brief',
                'type'          => 'true_false',
                'default_value' => 1,
                'ui'            => 1,
            ],
            [
                'key'   => 'field_ded_brief_text',
                'label' => 'Brief',
                'name'  => 'brief_text',
                'type'  => 'textarea',
                'rows'  => 6,
            ],

            // ── Approach tab ──
            [ 'key' => 'field_ded_tab_approach', 'label' => 'Approach', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_show_approach',
                'label'         => 'Show approach',
                'name'          => 'show_approach',
                'type'          => 'true_false',
                'default_value' => 1,
                'ui'            => 1,
            ],
            [
                'key'   => 'field_ded_approach_text',
                'label' => 'Approach',
                'name'  => 'approach_text',
                'type'  => 'textarea',
                'rows'  => 6,
            ],

            // ── Work tab ──
            [ 'key' => 'field_ded_tab_work', 'label' => 'Work', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_show_gallery',
                'label'         => 'Show gallery',
                'name'          => 'show_gallery',
                'type'          => 'true_false',
                'default_value' => 1,
                'ui'            => 1,
            ],
            [
                'key'          => 'field_ded_gallery_items',
                'label'        => 'Gallery items',
                'name'         => 'gallery_items',
                'type'         => 'repeater',
                'min'          => 0,
                'max'          => 10,
                'layout'       => 'block',
                'button_label' => 'Add gallery item',
                'sub_fields'   => [
                    [
                        'key'           => 'field_ded_g_image',
                        'label'         => 'Image',
                        'name'          => 'g_image',
                        'type'          => 'image',
                        'return_format' => 'array',
                        'preview_size'  => 'medium',
                        'library'       => 'all',
                    ],
                    [ 'key' => 'field_ded_g_title',   'label' => 'Title',   'name' => 'g_title',   'type' => 'text' ],
                    [ 'key' => 'field_ded_g_caption', 'label' => 'Caption', 'name' => 'g_caption', 'type' => 'text' ],
                ],
            ],

            // ── Video tab ──
            [ 'key' => 'field_ded_tab_video', 'label' => 'Video', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_show_video',
                'label'         => 'Show video',
                'name'          => 'show_video',
                'type'          => 'true_false',
                'default_value' => 0,
                'ui'            => 1,
            ],
            [
                'key'   => 'field_ded_video_url',
                'label' => 'Video URL',
                'name'  => 'video_url',
                'type'  => 'url',
            ],

            // ── Outcome tab ──
            [ 'key' => 'field_ded_tab_outcome', 'label' => 'Outcome', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_show_outcome',
                'label'         => 'Show outcome',
                'name'          => 'show_outcome',
                'type'          => 'true_false',
                'default_value' => 1,
                'ui'            => 1,
            ],
            [
                'key'   => 'field_ded_outcome_text',
                'label' => 'Outcome',
                'name'  => 'outcome_text',
                'type'  => 'textarea',
                'rows'  => 6,
            ],
            [
                'key'          => 'field_ded_outcome_stats',
                'label'        => 'Outcome stats',
                'name'         => 'outcome_stats',
                'type'         => 'repeater',
                'instructions' => 'Up to three proof points shown as big numerals under the outcome statement — e.g. value “2008”, label “Client since”. Leave empty to show the statement alone.',
                'min'          => 0,
                'max'          => 3,
                'layout'       => 'table',
                'button_label' => 'Add stat',
                'sub_fields'   => [
                    [ 'key' => 'field_ded_os_value', 'label' => 'Value', 'name' => 'os_value', 'type' => 'text' ],
                    [ 'key' => 'field_ded_os_label', 'label' => 'Label', 'name' => 'os_label', 'type' => 'text' ],
                ],
            ],

            // ── Testimonial tab ──
            [ 'key' => 'field_ded_tab_testimonial', 'label' => 'Testimonial', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_show_testimonial',
                'label'         => 'Show testimonial',
                'name'          => 'show_testimonial',
                'type'          => 'true_false',
                'default_value' => 0,
                'ui'            => 1,
            ],
            [
                'key'   => 'field_ded_t_quote',
                'label' => 'Quote',
                'name'  => 't_quote',
                'type'  => 'textarea',
                'rows'  => 4,
            ],
            [ 'key' => 'field_ded_t_name', 'label' => 'Name', 'name' => 't_name', 'type' => 'text' ],
            [ 'key' => 'field_ded_t_role', 'label' => 'Role', 'name' => 't_role', 'type' => 'text' ],

            // ── Related & CTA tab ──
            [ 'key' => 'field_ded_tab_related', 'label' => 'Related & CTA', 'name' => '', 'type' => 'tab', 'placement' => 'top' ],
            [
                'key'           => 'field_ded_show_related',
                'label'         => 'Show related projects',
                'name'          => 'show_related',
                'type'          => 'true_false',
                'default_value' => 1,
                'ui'            => 1,
            ],
            [
                'key'           => 'field_ded_related_projects',
                'label'         => 'Related projects',
                'name'          => 'related_projects',
                'type'          => 'relationship',
                'post_type'     => [ 'ded_project' ],
                'filters'       => [ 'search' ],
                'max'           => 3,
                'return_format' => 'id',
            ],
            [
                'key'           => 'field_ded_show_cta',
                'label'         => 'Show CTA',
                'name'          => 'show_cta',
                'type'          => 'true_false',
                'default_value' => 1,
                'ui'            => 1,
            ],
            [
                'key'   => 'field_ded_cta_heading',
                'label' => 'CTA heading',
                'name'  => 'cta_heading',
                'type'  => 'text',
            ],
        ],
    ] );
}
