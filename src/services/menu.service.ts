import { menus } from '../db/schema.js';

export function buildMenuTree(menuItems: any[]): any[] {
    const map: any = {};
    const tree: any[] = [];

    menuItems.forEach(item => {
        map[item.id] = { ...item, children: [] };
    });

    menuItems.forEach(item => {
        if (item.parentId && map[item.parentId]) {
            map[item.parentId].children.push(map[item.id]);
        } else {
            tree.push(map[item.id]);
        }
    });

    // Ordenar por el campo 'orden'
    const sortTree = (nodes: any[]) => {
        nodes.sort((a, b) => a.orden - b.orden);
        nodes.forEach(node => sortTree(node.children));
    };
    sortTree(tree);

    return tree;
}