// ==UserScript==
// @name         Claimed Jobs
// @namespace    https://fluently.moravia.com/jobs/claimed
// @version      0.1
// @description  Group assets by comments and open all, invert selection, select all
// @author       You
// @match        https://fluently.moravia.com/jobs/claimed
// @grant    GM_openInTab
// ==/UserScript==

(function () {
  "use strict";

  // Function to find the session storage item with a specific environment
  function findTokenKey() {
    const keys = Object.keys(sessionStorage);

    for (const key of keys) {
      try {
        // Retrieve and parse the item
        const item = JSON.parse(sessionStorage.getItem(key));

        // Check if the item contains the environment
        if (item && item.tokenType === "Bearer") {
          // Return the key.secret if available
          return item["secret"] || null;
        }
      } catch (e) {
        console.error("Error parsing session storage item:", e);
        // Handle errors in parsing JSON or accessing properties
      }
    }

    console.error("No item found with the specified environment");
    return null;
  }

  // Function to collect URLs for each group
  function collectUrlsForGroup(cloudUids) {
    const urls = [];

    if (cloudUids.length === 1) {
      urls.push(
        `https://cloud.memsource.com/web/job/${cloudUids[0]}/translate`
      );
    } else if (cloudUids.length > 1) {
      urls.push(
        `https://cloud.memsource.com/web/job/${cloudUids.join("-")}/translate`
      );
    }

    return urls;
  }

  // Function to open all collected URLs in new tabs with a delay
  function openAllUrls(urls) {
    const delay = 100; // Delay in milliseconds between opening tabs

    urls.forEach((url, index) => {
      setTimeout(() => {
        GM_openInTab(url);
      }, index * delay); // Delay increases with index to open tabs sequentially
    });
  }

  // Function to fetch data using the token from session storage
  async function fetchWithSessionToken(url) {
    const token = findTokenKey();

    if (!token) {
      console.error("No token found");
      return null;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Fetch error:", error);
      return null;
    }
  }

  // Function to renew the data when opening an asset
  async function renewData(filteredData) {
    const token = findTokenKey();

    if (!token) {
      console.error("No token found");
      return null;
    }

    const data = filteredData.map(
      ({ assetPKID, cloudProjectUid, cloudUid }) => ({
        AssetPKID: assetPKID,
        CloudProjectId: cloudProjectUid,
        CloudUid: cloudUid,
      })
    );

    try {
      const response = await fetch("/api/asset/RenewLicense", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    }

    return null;
  }

  async function fetchProgressData(assetPkIds) {
    const url = `/api/v2.0/AssetAdditionalData?type=2&assetPkIds=${assetPkIds}`;
    const token = findTokenKey();

    if (!token) {
      console.error("No token found");
      return null;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Fetch error:", error);
      return null;
    }
  }

  // Function to group data by comment
  function groupDataByComment(data) {
    const groups = {};

    data.forEach((item) => {
      if (item.comment) {
        const comment = item.comment;
        const assetPkId = item.assetPkId;
        if (!groups[comment]) {
          groups[comment] = [];
          groups[assetPkId] = [];
        }
        groups[comment].push(item.cloudUid);
      }
    });

    return groups;
  }

  // Function to filter data by progress
  function filterDataByProgress(data, progressData, isExact100) {
    // Create a set of asset IDs that have a specific progress status
    const progressMap = new Map(
      progressData.map((item) => [item.assetPkId, item.progress])
    );

    const filteredData = data.filter((item) => {
      const progress = progressMap.get(item.assetPKID);
      if (progress === undefined) {
        // Include item if progress information is missing
        return isExact100 ? false : true;
      }
      // Check if the progress meets the filtering criteria
      return isExact100 ? progress === 100 : progress !== 100;
    });

    return filteredData;
  }

  // Main function to handle the entire process
  async function openAll() {
    const url = "/api/asset/claimed";
    const data = await fetchWithSessionToken(url);
    const assetPkIds = data.map((data) => data.assetPKID).join(",");
    const progressData = await fetchProgressData(assetPkIds);

    if (!data) return;

    // Group and sort data by comment
    const filteredData = filterDataByProgress(data, progressData, false);
    const groupedData = groupDataByComment(filteredData);

    // Collect all URLs
    const allUrls = [];
    for (const cloudUids of Object.values(groupedData)) {
      allUrls.push(...collectUrlsForGroup(cloudUids));
    }

    await renewData(filteredData);

    // Open all URLs in new tabs
    openAllUrls(allUrls);
  }

  // Function to select and click elements
  // THIS IS FETCHING AND IS SLOWER
  /*
  async function selectAssets() {
      const url = '/api/asset/claimed';
      const data = await fetchWithSessionToken(url);
      const assetPkIds = data.map(data => data.assetPKID).join(',');
      const progressData = await fetchProgressData(assetPkIds);

      if (!data) return;

      // Group and sort data by comment
      const filteredData = filterDataByProgress(data, progressData, true);

      // Generate element IDs and click each
      filteredData.forEach(asset => {
          const elementId = `jobs-claimed-assetPKID-${asset.assetPKID}01`;
          const element = document.getElementById(elementId);
          if (element) {
              element.click();  // Simulate the click event
          } else {
              console.log(`Element with ID: ${elementId} not found.`);
          }
      });
  }
  */

  // THIS SHOULD BE FASTER SINCE IT'S NOT FETCHING
  async function selectAssets() {
    const allAssets = document.querySelectorAll(
      '[id^="jobs-claimed-awesome-table-item-"]'
    );
    const prefix = "jobs-claimed-awesome-table-item-";

    allAssets.forEach((asset) => {
      const progressBar = asset.children[1].children[0].children[0].children[0];
      const elementSelectId = `jobs-claimed-select-${asset.id.substring(
        prefix.length
      )}`;
      const elementSelect = document.getElementById(elementSelectId);
      const elementSelectCheckbox = elementSelect.children[0].children[0];
      if (progressBar.className.includes("ub-w_100prcn")) {
        !elementSelectCheckbox.checked && elementSelectCheckbox.click();
      } else {
        elementSelectCheckbox.checked && elementSelectCheckbox.click();
      }
    });
  }

  // Function to invert selection
  async function invertSelection() {
    const allAssets = document.querySelectorAll(
      '[id^="jobs-claimed-awesome-table-item-"]'
    );
    const prefix = "jobs-claimed-awesome-table-item-";

    // Invert click
    allAssets.forEach((asset) => {
      const elementId = `jobs-claimed-assetPKID-${asset.id.substring(
        prefix.length
      )}`;
      const element = document.getElementById(elementId);
      if (element) {
        element.click(); // Simulate the click event
      } else {
        console.log(`Element with ID: ${elementId} not found.`);
      }
    });
  }

  // Function to create and insert the custom button
  function addCustomButton() {
    // Select the buttons nav
    const buttonsNav = document.getElementById(
      "jobs-claimed-complete-button"
    ).parentNode;

    // Create new button elements
    let buttonOpenAll = document.createElement("button");
    buttonOpenAll.className =
      "ub-pst_relative ub-f-wght_500 ub-dspl_inline-flex ub-algn-itms_center ub-flx-wrap_nowrap ub-just-cnt_center ub-txt-deco_none ub-ver-algn_middle ub-b-btm_1px-solid-c1c4d6 ub-b-lft_1px-solid-c1c4d6 ub-b-rgt_1px-solid-c1c4d6 ub-b-top_1px-solid-c1c4d6 ub-otln_iu2jf4 ub-usr-slct_none ub-crsr_pointer ub-wht-spc_nowrap ub-fnt-fam_b77syt ub-bblr_4px ub-bbrr_4px ub-btlr_4px ub-btrr_4px ub-color_474d66 ub-tstn_n1akt6 ub-h_32px ub-min-w_32px ub-fnt-sze_12px ub-ln-ht_32px ub-pl_16px ub-pr_16px ub-bg-clr_white ub-bs_13po50p_xpy5ci ub-crsr_not-allowed_yzzm16 ub-ptr-evts_none_yzzm16 ub-color_c1c4d6_yzzm16 ub-b-btm-clr_E6E8F0_yzzm16 ub-b-lft-clr_E6E8F0_yzzm16 ub-b-rgt-clr_E6E8F0_yzzm16 ub-b-top-clr_E6E8F0_yzzm16 ub-b-btm_1px-solid-8f95b2_vmhk7m ub-b-lft_1px-solid-8f95b2_vmhk7m ub-b-rgt_1px-solid-8f95b2_vmhk7m ub-b-top_1px-solid-8f95b2_vmhk7m ub-bg-clr_FAFBFF_vmhk7m ub-bg-clr_e1ecf8_hxa9p6 ub-mt_8px ub-ml_8px ub-box-szg_border-box";
    buttonOpenAll.id = "jobs-open-all-button";
    buttonOpenAll.style =
      "-webkit-font-smoothing: antialiased; appearance: none;";
    let buttonSelectCompleted = document.createElement("button");
    buttonSelectCompleted.className =
      "ub-pst_relative ub-f-wght_500 ub-dspl_inline-flex ub-algn-itms_center ub-flx-wrap_nowrap ub-just-cnt_center ub-txt-deco_none ub-ver-algn_middle ub-b-btm_1px-solid-c1c4d6 ub-b-lft_1px-solid-c1c4d6 ub-b-rgt_1px-solid-c1c4d6 ub-b-top_1px-solid-c1c4d6 ub-otln_iu2jf4 ub-usr-slct_none ub-crsr_pointer ub-wht-spc_nowrap ub-fnt-fam_b77syt ub-bblr_4px ub-bbrr_4px ub-btlr_4px ub-btrr_4px ub-color_474d66 ub-tstn_n1akt6 ub-h_32px ub-min-w_32px ub-fnt-sze_12px ub-ln-ht_32px ub-pl_16px ub-pr_16px ub-bg-clr_white ub-bs_13po50p_xpy5ci ub-crsr_not-allowed_yzzm16 ub-ptr-evts_none_yzzm16 ub-color_c1c4d6_yzzm16 ub-b-btm-clr_E6E8F0_yzzm16 ub-b-lft-clr_E6E8F0_yzzm16 ub-b-rgt-clr_E6E8F0_yzzm16 ub-b-top-clr_E6E8F0_yzzm16 ub-b-btm_1px-solid-8f95b2_vmhk7m ub-b-lft_1px-solid-8f95b2_vmhk7m ub-b-rgt_1px-solid-8f95b2_vmhk7m ub-b-top_1px-solid-8f95b2_vmhk7m ub-bg-clr_FAFBFF_vmhk7m ub-bg-clr_e1ecf8_hxa9p6 ub-mt_8px ub-ml_8px ub-box-szg_border-box";
    buttonSelectCompleted.id = "jobs-select-completed-button";
    buttonSelectCompleted.style =
      "-webkit-font-smoothing: antialiased; appearance: none;";
    let buttonInvert = document.createElement("button");
    buttonInvert.className =
      "ub-pst_relative ub-f-wght_500 ub-dspl_inline-flex ub-algn-itms_center ub-flx-wrap_nowrap ub-just-cnt_center ub-txt-deco_none ub-ver-algn_middle ub-b-btm_1px-solid-c1c4d6 ub-b-lft_1px-solid-c1c4d6 ub-b-rgt_1px-solid-c1c4d6 ub-b-top_1px-solid-c1c4d6 ub-otln_iu2jf4 ub-usr-slct_none ub-crsr_pointer ub-wht-spc_nowrap ub-fnt-fam_b77syt ub-bblr_4px ub-bbrr_4px ub-btlr_4px ub-btrr_4px ub-color_474d66 ub-tstn_n1akt6 ub-h_32px ub-min-w_32px ub-fnt-sze_12px ub-ln-ht_32px ub-pl_16px ub-pr_16px ub-bg-clr_white ub-bs_13po50p_xpy5ci ub-crsr_not-allowed_yzzm16 ub-ptr-evts_none_yzzm16 ub-color_c1c4d6_yzzm16 ub-b-btm-clr_E6E8F0_yzzm16 ub-b-lft-clr_E6E8F0_yzzm16 ub-b-rgt-clr_E6E8F0_yzzm16 ub-b-top-clr_E6E8F0_yzzm16 ub-b-btm_1px-solid-8f95b2_vmhk7m ub-b-lft_1px-solid-8f95b2_vmhk7m ub-b-rgt_1px-solid-8f95b2_vmhk7m ub-b-top_1px-solid-8f95b2_vmhk7m ub-bg-clr_FAFBFF_vmhk7m ub-bg-clr_e1ecf8_hxa9p6 ub-mt_8px ub-ml_8px ub-box-szg_border-box";
    buttonInvert.id = "jobs-select-completed-button";
    buttonInvert.style =
      "-webkit-font-smoothing: antialiased; appearance: none;";

    // Add button text
    let buttonOpenAllText = document.createTextNode("Open all");
    let buttonSelectCompletedText = document.createTextNode("Select 100%");
    let buttonInvertText = document.createTextNode("Invert Selection");
    buttonOpenAll.appendChild(buttonOpenAllText);
    buttonSelectCompleted.appendChild(buttonSelectCompletedText);
    buttonInvert.appendChild(buttonInvertText);

    // Add click event listener
    buttonOpenAll.addEventListener("click", function () {
      openAll();
    });

    buttonSelectCompleted.addEventListener("click", function () {
      selectAssets();
    });

    buttonInvert.addEventListener("click", function () {
      invertSelection();
    });

    // Append button to the body
    buttonsNav.append(buttonOpenAll);
    buttonsNav.append(buttonSelectCompleted);
    buttonsNav.append(buttonInvert);
  }

  // Execute the function to add the button
  setTimeout(() => {
    addCustomButton();
  }, 2000);
})();
