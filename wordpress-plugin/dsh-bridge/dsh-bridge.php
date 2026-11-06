<?php
/**
 * Plugin Name:       DSH Bridge
 * Plugin URI:        https://github.com/engbonuonga/dsh-wordpress-admin
 * Description:       Companion REST routes for DeepSeek Harness: classic navigation menus, menu items and theme menu locations. The WordPress core REST API does not expose these, so this plugin fills the gap for the dsh-wordpress-admin plugin.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Brian Onuonga
 * Author URI:        https://github.com/engbonuonga
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       dsh-bridge
 *
 * @package DSH_Bridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the dsh-bridge/v1 routes used by the DSH WordPress admin plugin.
 */
final class DSH_Bridge {

	const NS = 'dsh-bridge/v1';

	/**
	 * Hook the REST routes.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Only users who can edit the theme may read or change menus and locations.
	 */
	public static function can_manage() {
		return current_user_can( 'edit_theme_options' );
	}

	/**
	 * Register every route.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NS,
			'/status',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'status' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::NS,
			'/menus',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'list_menus' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'create_menu' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
			)
		);

		register_rest_route(
			self::NS,
			'/menus/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_menu' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'update_menu' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( __CLASS__, 'delete_menu' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
			)
		);

		register_rest_route(
			self::NS,
			'/menus/(?P<id>\d+)/items',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'list_items' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'replace_items' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
			)
		);

		register_rest_route(
			self::NS,
			'/locations',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'list_locations' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'assign_locations' ),
					'permission_callback' => array( __CLASS__, 'can_manage' ),
				),
			)
		);
	}

	/**
	 * Public health probe used by the DSH plugin to detect the bridge.
	 */
	public static function status() {
		return rest_ensure_response(
			array(
				'bridge'    => 'dsh-bridge',
				'version'   => '0.1.0',
				'wordpress' => get_bloginfo( 'version' ),
				'php'       => PHP_VERSION,
				'menus'     => wp_get_nav_menus() ? count( wp_get_nav_menus() ) : 0,
			)
		);
	}

	/**
	 * Menu term id to payload.
	 *
	 * @param WP_Term $menu Menu term.
	 * @return array
	 */
	private static function menu_payload( $menu ) {
		$assigned = array();
		foreach ( get_nav_menu_locations() as $location => $menu_id ) {
			if ( (int) $menu_id === (int) $menu->term_id ) {
				$assigned[] = $location;
			}
		}
		return array(
			'id'        => (int) $menu->term_id,
			'name'      => $menu->name,
			'slug'      => $menu->slug,
			'count'     => (int) $menu->count,
			'locations' => $assigned,
		);
	}

	/**
	 * Assign a menu to one or more theme locations.
	 *
	 * @param int   $menu_id   Menu term id.
	 * @param array $locations Location slugs.
	 */
	private static function assign_menu( $menu_id, $locations ) {
		if ( empty( $locations ) ) {
			return;
		}
		$assigned = get_nav_menu_locations();
		foreach ( (array) $locations as $location ) {
			$assigned[ sanitize_key( $location ) ] = (int) $menu_id;
		}
		set_theme_mod( 'nav_menu_locations', $assigned );
	}

	/**
	 * GET /menus
	 */
	public static function list_menus() {
		$menus = wp_get_nav_menus();
		$out   = array();
		foreach ( $menus as $menu ) {
			$out[] = self::menu_payload( $menu );
		}
		return rest_ensure_response( $out );
	}

	/**
	 * POST /menus
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function create_menu( WP_REST_Request $request ) {
		$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
		if ( '' === $name ) {
			return new WP_Error( 'dsh_bridge_bad_name', __( 'A menu name is required.', 'dsh-bridge' ), array( 'status' => 400 ) );
		}
		$menu_id = wp_create_nav_menu( $name );
		if ( is_wp_error( $menu_id ) ) {
			return $menu_id;
		}
		self::assign_menu( $menu_id, $request->get_param( 'locations' ) );
		$menu = wp_get_nav_menu_object( $menu_id );
		return rest_ensure_response( self::menu_payload( $menu ) );
	}

	/**
	 * GET /menus/{id}
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function get_menu( WP_REST_Request $request ) {
		$menu = wp_get_nav_menu_object( (int) $request['id'] );
		if ( ! $menu ) {
			return new WP_Error( 'dsh_bridge_not_found', __( 'Menu not found.', 'dsh-bridge' ), array( 'status' => 404 ) );
		}
		return rest_ensure_response( self::menu_payload( $menu ) );
	}

	/**
	 * POST /menus/{id}
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function update_menu( WP_REST_Request $request ) {
		$menu_id = (int) $request['id'];
		if ( ! wp_get_nav_menu_object( $menu_id ) ) {
			return new WP_Error( 'dsh_bridge_not_found', __( 'Menu not found.', 'dsh-bridge' ), array( 'status' => 404 ) );
		}
		$name = $request->get_param( 'name' );
		if ( null !== $name && '' !== $name ) {
			wp_update_nav_menu_object( $menu_id, array( 'menu-name' => sanitize_text_field( (string) $name ) ) );
		}
		self::assign_menu( $menu_id, $request->get_param( 'locations' ) );
		return rest_ensure_response( self::menu_payload( wp_get_nav_menu_object( $menu_id ) ) );
	}

	/**
	 * DELETE /menus/{id}
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function delete_menu( WP_REST_Request $request ) {
		$menu_id = (int) $request['id'];
		$menu    = wp_get_nav_menu_object( $menu_id );
		if ( ! $menu ) {
			return new WP_Error( 'dsh_bridge_not_found', __( 'Menu not found.', 'dsh-bridge' ), array( 'status' => 404 ) );
		}
		$payload = self::menu_payload( $menu );
		$deleted = wp_delete_nav_menu( $menu_id );
		if ( ! $deleted || is_wp_error( $deleted ) ) {
			return new WP_Error( 'dsh_bridge_delete_failed', __( 'The menu could not be deleted.', 'dsh-bridge' ), array( 'status' => 500 ) );
		}
		return rest_ensure_response(
			array(
				'deleted'  => true,
				'previous' => $payload,
			)
		);
	}

	/**
	 * GET /menus/{id}/items
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function list_items( WP_REST_Request $request ) {
		$menu_id = (int) $request['id'];
		if ( ! wp_get_nav_menu_object( $menu_id ) ) {
			return new WP_Error( 'dsh_bridge_not_found', __( 'Menu not found.', 'dsh-bridge' ), array( 'status' => 404 ) );
		}
		$items = wp_get_nav_menu_items( $menu_id );
		$out   = array();
		foreach ( (array) $items as $item ) {
			$out[] = array(
				'id'               => (int) $item->ID,
				'title'            => $item->title,
				'url'              => $item->url,
				'menu_item_parent' => (int) $item->menu_item_parent,
				'position'         => (int) $item->menu_order,
				'type'             => $item->type,
				'object'           => $item->object,
				'object_id'        => (int) $item->object_id,
				'target'           => $item->target,
				'classes'          => array_values( array_filter( (array) $item->classes ) ),
				'xfn'              => $item->xfn,
				'attr_title'       => $item->attr_title,
				'description'      => $item->description,
			);
		}
		return rest_ensure_response( $out );
	}

	/**
	 * POST /menus/{id}/items — replace every item in the menu.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function replace_items( WP_REST_Request $request ) {
		$menu_id = (int) $request['id'];
		if ( ! wp_get_nav_menu_object( $menu_id ) ) {
			return new WP_Error( 'dsh_bridge_not_found', __( 'Menu not found.', 'dsh-bridge' ), array( 'status' => 404 ) );
		}
		$items = $request->get_param( 'items' );
		if ( ! is_array( $items ) ) {
			return new WP_Error( 'dsh_bridge_bad_items', __( '`items` must be an array.', 'dsh-bridge' ), array( 'status' => 400 ) );
		}

		foreach ( (array) wp_get_nav_menu_items( $menu_id ) as $existing ) {
			wp_delete_post( $existing->ID, true );
		}

		$position = 0;
		$created  = array();
		foreach ( $items as $item ) {
			$position++;
			$args = array(
				'menu-item-title'     => sanitize_text_field( (string) ( $item['title'] ?? '' ) ),
				'menu-item-url'       => esc_url_raw( (string) ( $item['url'] ?? '' ) ),
				'menu-item-status'    => 'publish',
				'menu-item-parent-id' => absint( $item['menu_item_parent'] ?? 0 ),
				'menu-item-position'  => absint( $item['position'] ?? $position ),
				'menu-item-type'      => sanitize_key( (string) ( $item['type'] ?? 'custom' ) ),
				'menu-item-object'    => sanitize_key( (string) ( $item['object'] ?? '' ) ),
				'menu-item-object-id' => absint( $item['object_id'] ?? 0 ),
				'menu-item-target'    => sanitize_text_field( (string) ( $item['target'] ?? '' ) ),
				'menu-item-xfn'       => sanitize_text_field( (string) ( $item['xfn'] ?? '' ) ),
				'menu-item-attr-title' => sanitize_text_field( (string) ( $item['attr_title'] ?? '' ) ),
				'menu-item-description' => sanitize_textarea_field( (string) ( $item['description'] ?? '' ) ),
			);
			if ( ! empty( $item['classes'] ) ) {
				$args['menu-item-classes'] = implode( ' ', array_map( 'sanitize_html_class', (array) $item['classes'] ) );
			}
			$item_id = wp_update_nav_menu_item( $menu_id, 0, $args );
			if ( ! is_wp_error( $item_id ) ) {
				$created[] = (int) $item_id;
			}
		}

		return rest_ensure_response(
			array(
				'menu'    => $menu_id,
				'created' => $created,
				'count'   => count( $created ),
			)
		);
	}

	/**
	 * GET /locations — registered theme locations plus current assignments.
	 */
	public static function list_locations() {
		$registered  = get_registered_nav_menus();
		$assigned    = get_nav_menu_locations();
		$assignments = array();
		foreach ( $assigned as $location => $menu_id ) {
			$menu = wp_get_nav_menu_object( $menu_id );
			$assignments[ $location ] = $menu
				? array(
					'id'   => (int) $menu->term_id,
					'name' => $menu->name,
				)
				: null;
		}
		return rest_ensure_response(
			array(
				'registered'  => $registered,
				'assignments' => $assignments,
			)
		);
	}

	/**
	 * POST /locations — {assignments: {location: menu_id}}.
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public static function assign_locations( WP_REST_Request $request ) {
		$assignments = $request->get_param( 'assignments' );
		if ( ! is_array( $assignments ) ) {
			return new WP_Error( 'dsh_bridge_bad_locations', __( '`assignments` must be an object.', 'dsh-bridge' ), array( 'status' => 400 ) );
		}
		$current = get_nav_menu_locations();
		foreach ( $assignments as $location => $menu_id ) {
			$menu_id = absint( $menu_id );
			if ( $menu_id > 0 && ! wp_get_nav_menu_object( $menu_id ) ) {
				return new WP_Error( 'dsh_bridge_bad_menu', __( 'One of the menus does not exist.', 'dsh-bridge' ), array( 'status' => 400 ) );
			}
			$current[ sanitize_key( $location ) ] = $menu_id;
		}
		set_theme_mod( 'nav_menu_locations', $current );
		return self::list_locations();
	}
}

DSH_Bridge::init();
