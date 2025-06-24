/*document.addEventListener("DOMContentLoaded", function () {
    const siteModal = document.getElementById("siteModal");
    const siteModalBtn = document.getElementById("siteModalBtn");
    const closeSiteModal = document.getElementById("closeSiteModal");
    const siteIframe = document.getElementById("siteIframe");

    // Check if elements exist
    if (!siteModal || !siteModalBtn || !closeSiteModal || !siteIframe) {
        console.error("One or more modal elements not found!");
        return;
    }

    // URL of the site to display in the iframe
    const siteURL = "https://medelbou3.github.io/SM-studio-stor/";

    // Open modal when clicking the "Stor" button
    siteModalBtn.addEventListener("click", function () {
        siteIframe.src = siteURL; // Load the site in the iframe
        siteModal.style.display = "flex"; // Show the modal
    });

    // Close modal when clicking the close button
    closeSiteModal.addEventListener("click", function () {
        siteModal.style.display = "none"; // Hide the modal
        siteIframe.src = ""; // Clear iframe
    });

    // Close modal when clicking outside the content
    siteModal.addEventListener("click", function (event) {
        if (event.target === siteModal) {
            siteModal.style.display = "none";
            siteIframe.src = "";
        }
    });

    // Close modal with Escape key
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && siteModal.style.display === "flex") {
            siteModal.style.display = "none";
            siteIframe.src = "";
        }
    });
});*/

document.addEventListener("DOMContentLoaded", function () {
    const siteModal = document.getElementById("siteModal");
    const siteModalBtn = document.getElementById("siteModalBtn");
    const closeSiteModal = document.getElementById("closeSiteModal");
    const siteIframe = document.getElementById("siteIframe");

    if (!siteModal || !siteModalBtn || !closeSiteModal || !siteIframe) {
        console.error("One or more modal elements not found!");
        return;
    }

    const siteURL = "https://medelbou3.github.io/SM-studio-stor/";

    function openModal() {
        if (siteIframe.src !== siteURL) {
           siteIframe.src = siteURL; 
        }
        siteModal.classList.add("is-visible");
    }

    function closeModal() {
        siteModal.classList.remove("is-visible");
        // Optional: Clear iframe after animation to save resources
        setTimeout(() => {
            if (!siteModal.classList.contains('is-visible')) {
                siteIframe.src = "about:blank"; 
            }
        }, 300); // Match transition duration
    }

    siteModalBtn.addEventListener("click", openModal);
    closeSiteModal.addEventListener("click", closeModal);
    
    siteModal.addEventListener("click", function (event) {
        if (event.target === siteModal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && siteModal.classList.contains("is-visible")) {
            closeModal();
        }
    });
});
