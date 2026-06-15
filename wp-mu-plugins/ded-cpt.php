<?php
/**
 * DED Project CPT + Discipline Taxonomy
 * Registers ded_project post type and discipline taxonomy with REST API support.
 */

add_action( 'init', 'ded_register_cpt' );
function ded_register_cpt() {

    register_post_type( 'ded_project', [
        'labels' => [
            'name'               => 'Projects',
            'singular_name'      => 'Project',
            'add_new'            => 'Add New Project',
            'add_new_item'       => 'Add New Project',
            'edit_item'          => 'Edit Project',
            'new_item'           => 'New Project',
            'view_item'          => 'View Project',
            'search_items'       => 'Search Projects',
            'not_found'          => 'No projects found',
            'not_found_in_trash' => 'No projects found in Trash',
        ],
        'public'            => true,
        'show_in_rest'      => true,
        'rest_base'         => 'ded_project',
        // 'page-attributes' enables the menu_order attribute, which the
        // drag-and-drop reorder (ASE Content Order) writes to.
        'supports'          => [ 'title', 'editor', 'thumbnail', 'excerpt', 'page-attributes' ],
        'has_archive'       => true,
        'rewrite'           => [ 'slug' => 'work' ],
        'menu_icon'         => 'dashicons-portfolio',
        'menu_position'     => 5,
    ] );

    register_taxonomy( 'discipline', 'ded_project', [
        'labels' => [
            'name'          => 'Disciplines',
            'singular_name' => 'Discipline',
            'search_items'  => 'Search Disciplines',
            'all_items'     => 'All Disciplines',
            'edit_item'     => 'Edit Discipline',
            'update_item'   => 'Update Discipline',
            'add_new_item'  => 'Add New Discipline',
            'new_item_name' => 'New Discipline Name',
            'menu_name'     => 'Disciplines',
        ],
        'public'            => true,
        'show_in_rest'      => true,
        'rest_base'         => 'discipline',
        'hierarchical'      => false,
        'rewrite'           => [ 'slug' => 'discipline' ],
    ] );

    // Seed discipline terms if they don't exist yet.
    $terms = [ 'print', 'web', 'video', 'photo', 'audio', 'identity', 'packaging' ];
    foreach ( $terms as $term ) {
        if ( ! term_exists( $term, 'discipline' ) ) {
            wp_insert_term( ucfirst( $term ), 'discipline', [ 'slug' => $term ] );
        }
    }
}

/**
 * Allow ?orderby=menu_order on the ded_project REST collection so the Astro
 * build can fetch projects in the drag-and-drop order. menu_order is not in
 * the default REST orderby enum, so it must be added explicitly.
 */
add_filter( 'rest_ded_project_collection_params', 'ded_project_rest_orderby_menu_order' );
function ded_project_rest_orderby_menu_order( $params ) {
    if ( isset( $params['orderby']['enum'] ) && is_array( $params['orderby']['enum'] )
        && ! in_array( 'menu_order', $params['orderby']['enum'], true ) ) {
        $params['orderby']['enum'][] = 'menu_order';
    }
    return $params;
}
