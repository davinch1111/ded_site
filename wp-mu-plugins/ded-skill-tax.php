<?php
/**
 * DED Skill Taxonomy
 * Registers `skill` taxonomy on ded_project with REST support, and seeds
 * the canonical term list used by individual project pages.
 *
 * Kept separate from ded-cpt.php so the CPT registration stays untouched.
 */

add_action( 'init', 'ded_register_skill_tax', 11 );
function ded_register_skill_tax() {

    register_taxonomy( 'skill', 'ded_project', [
        'labels' => [
            'name'          => 'Skills',
            'singular_name' => 'Skill',
            'search_items'  => 'Search Skills',
            'all_items'     => 'All Skills',
            'edit_item'     => 'Edit Skill',
            'update_item'   => 'Update Skill',
            'add_new_item'  => 'Add New Skill',
            'new_item_name' => 'New Skill Name',
            'menu_name'     => 'Skills',
        ],
        'public'            => true,
        'show_in_rest'      => true,
        'rest_base'         => 'skill',
        'hierarchical'      => false,
        'rewrite'           => [ 'slug' => 'skill' ],
    ] );

    $terms = [
        'print'            => 'Print',
        'brochures'        => 'Brochures',
        'folders'          => 'Folders',
        'logo'             => 'Logo',
        'business-cards'   => 'Business Cards',
        'signage'          => 'Signage',
        'car-wraps'        => 'Car Wraps',
        'interior-design'  => 'Interior Design',
        'exterior-design'  => 'Exterior Design',
        'website-design'   => 'Website Design',
        'photography'      => 'Photography',
        'photo-editing'    => 'Photo Editing',
        'video-shoot'      => 'Video Shoot',
        'video-editing'    => 'Video Editing',
        'music-creation'   => 'Music Creation',
        'audio-creation'   => 'Audio Creation',
    ];

    foreach ( $terms as $slug => $label ) {
        if ( ! term_exists( $slug, 'skill' ) ) {
            wp_insert_term( $label, 'skill', [ 'slug' => $slug ] );
        }
    }
}
