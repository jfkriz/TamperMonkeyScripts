// ==UserScript==
// @name         Jira Planning Poker Vote Counter
// @namespace    http://www.kriz.net/
// @version      0.1
// @description  Add a total votes counter to the planning poker panel.
// @author       jim@kriz.net
// @match        https://jira.kroger.com/jira/browse/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    const titleText = 'Easy Agile Planning Poker';
    const planningPokerTitle = document.evaluate(
        `//span[contains(text(), '${titleText}')]`,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;    
    const votesPanel = document.querySelector('[class*=PlanningPokerWebPanel__DisplayedVotesWrapper]');

    if (!planningPokerTitle || !votesPanel) {
        console.warn('Page may not be a jira issue page with a voting panel');
        return;
    }

    updateVoteCount();

    const observer = new MutationObserver(() => {
        updateVoteCount();
    });
    observer.observe(votesPanel, { childList: true });

    function updateVoteCount() {
        const totalVotes = votesPanel.children?.length || 0;
        planningPokerTitle.innerText = `${titleText} (Votes: ${totalVotes})`;
    }
})();
