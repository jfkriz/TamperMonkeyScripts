// ==UserScript==
// @name         Ingage Contributr Contributions List Sorting
// @namespace    http://www.kriz.net/
// @version      0.1
// @description  Sort the contributions list
// @author       jim@kriz.net
// @match        https://ingage-contributr.herokuapp.com/ingage/contributions/1
// @icon         https://www.google.com/s2/favicons?domain=herokuapp.com
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    window.addEventListener('load', () => {
        const table = document.getElementsByClassName('mui-table')[0];
        const headers = table.rows[0];
        const nameColumnNumber = 0;
        const nameHeader = headers.getElementsByTagName("TH")[nameColumnNumber];
        const amountColumnNumber = 1;
        const amountHeader = headers.getElementsByTagName("TH")[amountColumnNumber];

        setSortOrderAttribute(nameHeader, false);
        setSortOrderAttribute(amountHeader, false);

        sortTable(table, nameColumnNumber, nameHeader);

        nameHeader.addEventListener('click', () => {
            sortTable(table, nameColumnNumber, nameHeader);
        });

        amountHeader.addEventListener('click', () => {
            sortTable(table, amountColumnNumber, amountHeader);
        })
    });

    function getSortOrderAttribute(element) {
        return JSON.parse(element.getAttribute("data-sort-order-ascending"));
    }

    function setSortOrderAttribute(element, ascending) {
        element.setAttribute("data-sort-order-ascending", ascending);
    }

    function sortTable(table, column, header) {
        var ascending = !getSortOrderAttribute(header);
        setSortOrderAttribute(header, ascending);

        var rows, switching, i, x, y, shouldSwitch;
        switching = true;
        /* Make a loop that will continue until
        no switching has been done: */
        while (switching) {
            // Start by saying: no switching is done:
            switching = false;
            rows = table.rows;
            /* Loop through all table rows (except the
            first, which contains table headers): */
            for (i = 1; i < (rows.length - 1); i++) {
                // Start by saying there should be no switching:
                shouldSwitch = false;
                /* Get the two elements you want to compare,
                one from current row and one from the next: */
                x = rows[i].getElementsByTagName("TD")[column];
                y = rows[i + 1].getElementsByTagName("TD")[column];
                // Check if the two rows should switch place:
                if (ascending && x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()) {
                    // If so, mark as a switch and break the loop:
                    shouldSwitch = true;
                    break;
                } else if (!ascending && x.innerHTML.toLowerCase() < y.innerHTML.toLowerCase()) {
                    shouldSwitch = true;
                    break;
                }
            }
            if (shouldSwitch) {
                /* If a switch has been marked, make the switch
                and mark that a switch has been done: */
                rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
                switching = true;
            }
        }
    }
})();