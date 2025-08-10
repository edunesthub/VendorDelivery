
        
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, deleteDoc, updateDoc, query, where, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyADvpUQWo75ExePGoCRirD2mM-lmfM4Cmc",
    authDomain: "von600-7982d.firebaseapp.com",
    projectId: "von600-7982d",
    storageBucket: "von600-7982d.appspot.com",
    messagingSenderId: "164591218045",
    appId: "1:164591218045:web:afe17512e16573e7903014",
    measurementId: "G-E69DMPLXBK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 🔐 Retry-safe OneSignal tag function
async function safeTagUser(email, retries = 1) {
  try {
    await OneSignal.setExternalUserId(email);
    await OneSignal.sendTags({
      role: "vendor",
      vendorId: email
    });
    console.log("✅ OneSignal tags applied:", email);
  } catch (e) {
    console.warn("❌ OneSignal tag failed. Retrying...", e);
    if (retries > 0) {
      setTimeout(() => safeTagUser(email, retries - 1), 3000);
    }
  }
}

// 🔁 Validate tags on load
async function validateOneSignalTags(email) {
  try {
    const tags = await OneSignal.getTags();
    if (tags.vendorId !== email || tags.role !== "vendor") {
      console.warn("🔄 Tag mismatch. Reapplying...");
      await safeTagUser(email);
    } else {
      console.log("✅ Tags already correct.");
    }
  } catch (err) {
    console.error("❌ Failed to validate OneSignal tags:", err);
  }
}

const loginForm = document.getElementById("login-form");
const loginBtn = document.getElementById("login-btn");
const loginSpinner = document.getElementById("login-spinner");
const loginBtnText = document.getElementById("login-btn-text");


// Force OneSignal setup at login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  loginBtn.disabled = true;
  loginSpinner.style.display = "inline-block";
  loginBtnText.textContent = "Signing In...";

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    OneSignal.push(async () => {
      await OneSignal.registerForPushNotifications();
      await safeTagUser(user.email);
    });

    loginSection.style.display = "none";
    mainContent.classList.remove("hidden");
    restaurantId = user.uid;
    await ensureVisibilityFields();
    loadRestaurantData();
    loadMenu();
    loadDashboard();
    toggleSection("view-orders");
  } catch (error) {
    showNotification("Invalid email or password", "error");
  } finally {
    loginBtn.disabled = false;
    loginSpinner.style.display = "none";
    loginBtnText.textContent = "Sign In";
  }
});


let restaurantId = null;
let orderListenerUnsubscribe = null;


const loadingScreen = document.getElementById("loading-screen");
const loginSection = document.getElementById("login-section");
const mainContent = document.getElementById("main-content");
const menuList = document.getElementById("menu-list");
const ordersList = document.getElementById("orders-list");
const deliveredList = document.getElementById("delivered-list");
const dashboardGrid = document.getElementById("dashboard-grid");


async function getNextDeliveryEmailForHostel(hostelName) {
  const id = hostelName.toLowerCase().replace(/\s+/g, "_");
  const docRef = doc(db, "hostels", id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;

  const data = snap.data();
  const personnel = data.personnel || [];
  let index = data.currentIndex ?? 0;

  if (personnel.length === 0) return null;
  const selected = personnel[index % personnel.length];

  // Rotate index
  await updateDoc(docRef, {
    currentIndex: (index + 1) % personnel.length
  });

  return selected;
}

function showNotification(message, type = "success") {
    const notification = document.getElementById("notification");
    if (window.notificationTimer) {
        clearTimeout(window.notificationTimer);
    }
    const icon = type === "error" ? "fa-circle-exclamation" : 
                type === "warning" ? "fa-triangle-exclamation" : 
                type === "info" ? "fa-circle-info" : "fa-circle-check";
    notification.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    notification.className = `notification ${type}`;
    void notification.offsetWidth;
    notification.classList.add("show");
    if (type === "error" || type === "warning") {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
            audio.play().catch(() => {});
        } catch (e) {}
    }
    if (type === "error" && navigator.vibrate) {
        navigator.vibrate(200);
    }
    window.notificationTimer = setTimeout(() => {
        notification.classList.remove("show");
    }, 4000);
}

function toggleSection(sectionId) {
    const sections = ["store", "manage-menu", "view-orders", "delivered", "settings", "menu-edit-section", "categories-section", "delivery"];
    sections.forEach(id => {
        const section = document.getElementById(id);
        const button = document.getElementById(`${id}-btn`);
        if (section && button) {
            section.classList.toggle("hidden", id !== sectionId);
            button.classList.toggle("active", id === sectionId);
        } else if (section) {
            section.classList.toggle("hidden", id !== sectionId);
        }
    });
}

async function loadDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    const q = query(collection(db, "orders"));

    onSnapshot(q, (snapshot) => {
        let activeDeliveries = 0;
        let completedToday = 0;
        let totalOrdersToday = 0;

        snapshot.forEach(doc => {
            const order = doc.data();
            const timestamp = (order.timestamp?.toDate ? order.timestamp.toDate() : new Date(order.timestamp)).getTime();

            if (timestamp >= todayTimestamp) totalOrdersToday++;
            if (order.status === "delivered" && timestamp >= todayTimestamp) completedToday++;
            if (order.status === "being_delivered") activeDeliveries++;
        });

        const totalAmountToday = snapshot.docs
            .filter(doc => {
                const order = doc.data();
                const ts = (order.timestamp?.toDate ? order.timestamp.toDate() : new Date(order.timestamp)).getTime();
                const validStatuses = ["ready-for-pickup", "being_delivered", "delivered"];
                return validStatuses.includes(order.status) && ts >= todayTimestamp;
            })
            .reduce((sum, doc) => {
                const order = doc.data();
                const itemsList = order.items || order.cart || [];
                return sum + itemsList.reduce((sub, item) => sub + item.price * item.quantity, 0);
            }, 0);

        dashboardGrid.innerHTML = `
            <div class="dashboard-card">
                <h3>Today's Orders (All Restaurants)</h3>
                <p>${totalOrdersToday}</p>
            </div>
            <div class="dashboard-card">
                <h3>Completed Orders</h3>
                <p>${completedToday}</p>
            </div>
            <div class="dashboard-card">
                <h3>Today's Earnings</h3>
                <p>GH₵${totalAmountToday.toFixed(2)}</p>
            </div>
            <div class="dashboard-card">
                <h3>Active Deliveries</h3>
                <p>${activeDeliveries}</p>
            </div>
        `;
    }, (error) => {
        console.error("Dashboard error:", error);
        dashboardGrid.innerHTML = `<p class='text-gray-400'>Error loading dashboard data.</p>`;
    });
}


async function ensureVisibilityFields() {
  const menuRef = collection(db, "restaurant", restaurantId, "menu");
  const menuSnap = await getDocs(menuRef);
  const menuUpdates = menuSnap.docs.map(docSnap => {
    const data = docSnap.data();
    if (typeof data.visible === "undefined") {
      return updateDoc(doc(db, "restaurant", restaurantId, "menu", docSnap.id), { visible: true });
    }
    return Promise.resolve();
  });

  const catRef = collection(db, "restaurant", restaurantId, "categories");
  const catSnap = await getDocs(catRef);
  const catUpdates = catSnap.docs.map(docSnap => {
    const data = docSnap.data();
    if (typeof data.visible === "undefined") {
      return updateDoc(doc(db, "restaurant", restaurantId, "categories", docSnap.id), { visible: true });
    }
    return Promise.resolve();
  });

  await Promise.all([...menuUpdates, ...catUpdates]);
  console.log("Visibility fields ensured.");
}


async function loadRestaurantData() {
    if (!restaurantId) return;
    const docRef = doc(db, "restaurant", restaurantId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById("store-name").value = data.name || "";
        document.getElementById("restaurant-name").textContent = `${data.name || "Vendor"}`;
        document.getElementById("welcome-message").textContent = `Manage ${data.name || "your store"} with elegance.`;
        const isOpen = data.isOpen || false;
        document.getElementById("status-text").textContent = isOpen ? "Open" : "Closed";
        document.getElementById("status-text").style.color = isOpen ? "#34c759" : "#ff3b30";
    }
}

async function loadMenu() {
  if (!restaurantId) return;
  menuList.innerHTML = "<p class='text-gray-400'>Loading menu...</p>";
  try {
    const menuRef = collection(db, "restaurant", restaurantId, "menu");
    const querySnapshot = await getDocs(menuRef);
    menuList.innerHTML = "";

    if (querySnapshot.empty) {
      menuList.innerHTML = "<p class='text-gray-400'>No dishes added yet. Add one above!</p>";
      return;
    }

    const grouped = {};
    querySnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      const category = data.category || "Uncategorized";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push({ id: docSnapshot.id, ...data });
    });

    Object.entries(grouped).forEach(([category, items]) => {
      const heading = document.createElement("h3");
      heading.textContent = category;
      heading.style.marginTop = "1.5rem";
      heading.style.fontWeight = "600";
      heading.style.color = "#ccc";
      menuList.appendChild(heading);

      items.sort((a, b) => {
        const aOrder = a.orderNumber ?? 9999;
        const bOrder = b.orderNumber ?? 9999;
        return aOrder - bOrder;
      });

      items.forEach(data => {
        const item = document.createElement("div");
        item.className = "menu-item";
        item.innerHTML = `
          <div class="flex justify-between items-start w-full">
            <h4 style="margin: 0;">${data.name}</h4>
            <label class="toggle-switch">
              <input type="checkbox" ${data.visible !== false ? "checked" : ""}>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <p style="margin: 0.25rem 0 0.75rem;">GH₵${data.price.toFixed(2)}</p>
          <div class="menu-item-actions">
            <button class="btn btn-edit edit-dish-btn" data-id="${data.id}">Edit</button>
            <button class="btn btn-secondary delete-dish-btn" data-id="${data.id}">Delete</button>
          </div>
        `;

        menuList.appendChild(item);

        const toggleInput = item.querySelector("input[type='checkbox']");
        if (toggleInput) {
          toggleInput.addEventListener("change", async (e) => {
            await updateDoc(doc(db, "restaurant", restaurantId, "menu", data.id), {
              visible: e.target.checked
            });
            showNotification(`"${data.name}" is now ${e.target.checked ? "visible" : "hidden"}.`);
          });
        }

        item.querySelector(".edit-dish-btn").addEventListener("click", () => openEditSection(data.id));
        item.querySelector(".delete-dish-btn").addEventListener("click", () => deleteMenuItem(data.id));
      });
    });

  } catch (error) {
    console.error("Error loading menu:", error);
    menuList.innerHTML = "<p class='text-gray-400'>Error loading menu. Please try again.</p>";
    showNotification("Failed to load menu.", "error");
  }
}


let lastDeletedOption = null;
let hasUnsavedChanges = false;

function openAddSection() {
    const section = document.getElementById("menu-edit-section");
    const title = document.getElementById("menu-edit-title");
    const form = document.getElementById("menu-form");
    const nameInput = document.getElementById("menu-name");
    const priceInput = document.getElementById("menu-price");
    const sizeList = document.getElementById("size-list");
    const extraList = document.getElementById("extra-list");
    const undoBtn = document.getElementById("undo-btn");

    title.textContent = "Add Dish";
    form.reset();
    sizeList.innerHTML = "";
    extraList.innerHTML = "";
    form.dataset.mode = "add";
    delete form.dataset.id;
    section.classList.add("show");
    section.classList.remove("hidden");
    nameInput.focus();
    loadCategories();
    undoBtn.classList.add("hidden");
    hasUnsavedChanges = false;
    clearErrors();
}

async function loadCategories() {
  const select = document.getElementById("menu-category");
  if (!select) return;
  select.innerHTML = `<option value="">-- Select Category --</option>`;
  const categoriesRef = collection(db, "restaurant", restaurantId, "categories");
  const snapshot = await getDocs(categoriesRef);
  snapshot.forEach(doc => {
    const data = doc.data();
    const option = document.createElement("option");
    option.value = data.name;
    option.textContent = data.name;
    select.appendChild(option);
  });
}

async function loadCategoriesView() {
  const list = document.getElementById("category-list");
  list.innerHTML = "<p class='text-gray-400'>Loading categories...</p>";
  const categoriesRef = collection(db, "restaurant", restaurantId, "categories");

  try {
    const snapshot = await getDocs(categoriesRef);
    const docs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    docs.sort((a, b) => {
      const aOrder = a.sortOrder ?? 9999;
      const bOrder = b.sortOrder ?? 9999;
      return aOrder - bOrder;
    });

    list.innerHTML = "";

    if (!docs.length) {
      list.innerHTML = "<p class='text-gray-400'>No categories added yet.</p>";
      return;
    }

    docs.forEach(data => {
      const item = document.createElement("div");
      item.className = "menu-item";
      item.innerHTML = `
        <h4>${data.name} <span style="color:gray;">#${data.sortOrder ?? "?"}</span></h4>
        <div class="menu-item-actions">
          <button class="btn btn-edit" onclick="editCategory('${data.id}', '${data.name}')">Edit</button>
          <button class="btn btn-secondary" onclick="deleteCategory('${data.id}')">Delete</button>
        </div>
      `;
      const toggle = document.createElement("label");
toggle.innerHTML = `
  <div class="toggle-switch">
    <input type="checkbox" id="toggle-${data.id}" ${data.visible !== false ? "checked" : ""}>
    <span class="toggle-slider"></span>
  </div>
`;
toggle.style.display = "flex";
toggle.style.flexDirection = "column";
toggle.style.alignItems = "center";
toggle.style.marginRight = "1rem";

toggle.querySelector("input").addEventListener("change", async (e) => {
  await updateDoc(doc(db, "restaurant", restaurantId, "categories", data.id), {
    visible: e.target.checked
  });
  showNotification(`Category "${data.name}" is now ${e.target.checked ? "visible" : "hidden"}.`);
});

item.querySelector(".menu-item-actions").prepend(toggle);

const collapsibleToggle = document.createElement("label");
collapsibleToggle.innerHTML = `
  <div class="toggle-switch">
    <input type="checkbox" id="collapsible-${data.id}" ${data.collapsible ? "checked" : ""}>
    <span class="toggle-slider"></span>
    <small style="font-size: 0.75rem;">Collapsible</small>
  </div>
`;
collapsibleToggle.style.marginTop = "0.5rem";

collapsibleToggle.querySelector("input").addEventListener("change", async (e) => {
  await updateDoc(doc(db, "restaurant", restaurantId, "categories", data.id), {
    collapsible: e.target.checked
  });
  showNotification(`Category "${data.name}" collapsibility updated.`);
});


item.appendChild(collapsibleToggle);
      list.appendChild(item);
    });
  } catch (error) {
    console.error("Error loading categories:", error);
    showNotification("Could not load categories.", "error");
  }
}

async function editCategory(categoryId, oldName) {
  const newName = prompt("Enter new name for the category:", oldName);
  if (!newName || newName.trim() === "") {
    showNotification("Category name cannot be empty.", "error");
    return;
  }

  const newOrderInput = prompt("Enter new sort order number (e.g., 1 for top):");
  const newOrder = parseInt(newOrderInput, 10);
  if (isNaN(newOrder)) {
    showNotification("Invalid sort order.", "error");
    return;
  }

  try {
    const categoriesRef = collection(db, "restaurant", restaurantId, "categories");

    // Check for name conflict
    if (newName.trim() !== oldName) {
      const querySnap = await getDocs(query(categoriesRef, where("name", "==", newName.trim())));
      if (!querySnap.empty) {
        showNotification("Another category with this name already exists.", "warning");
        return;
      }
    }

    // 1. Update the category name document
    await updateDoc(doc(categoriesRef, categoryId), {
      name: newName.trim(),
      sortOrder: newOrder
    });

    // 2. Update all menu items with oldName
    const menuRef = collection(db, "restaurant", restaurantId, "menu");
    const menuQuery = query(menuRef, where("category", "==", oldName));
    const menuSnap = await getDocs(menuQuery);

    const batchUpdates = menuSnap.docs.map(docSnap => 
      updateDoc(doc(db, "restaurant", restaurantId, "menu", docSnap.id), {
        category: newName.trim()
      })
    );

    await Promise.all(batchUpdates);

    showNotification("Category and associated items updated successfully!");
    loadCategoriesView();
    loadCategories();
    loadMenu();

  } catch (error) {
    console.error("Error updating category and items:", error);
    showNotification("Failed to update category.", "error");
  }
}


async function deleteCategory(categoryId) {
  if (!confirm("Are you sure you want to delete this category?")) return;

  try {
    await deleteDoc(doc(db, "restaurant", restaurantId, "categories", categoryId));
    showNotification("Category deleted successfully!", "success");
    loadCategoriesView(); // Refresh category list
    loadCategories();     // Refresh dropdowns
  } catch (error) {
    console.error("Error deleting category:", error);
    showNotification("Failed to delete category.", "error");
  }
}


async function openEditSection(menuId) {
    try {
        const docRef = doc(db, "restaurant", restaurantId, "menu", menuId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const section = document.getElementById("menu-edit-section");
            const title = document.getElementById("menu-edit-title");
            const form = document.getElementById("menu-form");
            const nameInput = document.getElementById("menu-name");
            const priceInput = document.getElementById("menu-price");
            const sizeList = document.getElementById("size-list");
            const extraList = document.getElementById("extra-list");
            const undoBtn = document.getElementById("undo-btn");

            title.textContent = "Edit Dish";
            nameInput.value = data.name;
            priceInput.value = data.price.toFixed(2);
            sizeList.innerHTML = data.sizes?.length
                ? data.sizes.map((size, index) => `
                    <div class="option-item" data-index="${index}">
                        <p>${size.name} (GH₵${size.price.toFixed(2)})</p>
                        <button type="button" class="btn btn-cancel delete-option-btn" data-type="size" data-index="${index}"><i class="fas fa-trash"></i></button>
                    </div>
                `).join("")
                : "";
document.getElementById("menu-name").value = data.name || "";
document.getElementById("menu-price").value = data.price || "";
document.getElementById("menu-category").value = data.category || "";
document.getElementById("menu-order-number").value = data.orderNumber ?? '';

            extraList.innerHTML = data.extras?.length
                ? data.extras.map((extra, index) => `
                    <div class="option-item" data-index="${index}">
                        <p>${extra.name} (GH₵${extra.price.toFixed(2)})</p>
                        <button type="button" class="btn btn-cancel delete-option-btn" data-type="extra" data-index="${index}"><i class="fas fa-trash"></i></button>
                    </div>
                `).join("")
                : "";
            form.dataset.mode = "edit";
            form.dataset.id = menuId;
            section.classList.add("show");
            section.classList.remove("hidden");
            nameInput.focus();
            await loadCategories();
document.getElementById("menu-category").value = data.category || "";

            undoBtn.classList.add("hidden");
            hasUnsavedChanges = false;
            clearErrors();
            attachOptionDeleteListeners();
        } else {
            showNotification("Dish not found.", "error");
        }
    } catch (error) {
        console.error("Error opening edit section:", error);
        showNotification("Failed to load dish details.", "error");
    }
}



async function isAuthorizedDeliveryUser(email) {
    try {
        const deliveryMappingRef = doc(db, "deliveryMapping", email);
        const deliveryMappingSnap = await getDoc(deliveryMappingRef);
        if (deliveryMappingSnap.exists()) {
            const data = deliveryMappingSnap.data();
            window.allowedHostels = data.allowedHostels || [];
            return data.isDelivery === true;
        }
        window.allowedHostels = [];
        return false;
    } catch (error) {
        console.error("Error checking deliveryMapping:", err);
        window.allowedHostels = [];
        return false;
    }
}



function closeSection() {
    const section = document.getElementById("menu-edit-section");
    section.classList.remove("show");
    setTimeout(() => section.classList.add("hidden"), 300);
    hasUnsavedChanges = false;
}

function clearErrors() {
    document.querySelectorAll(".error-message").forEach(el => {
        el.textContent = "";
        el.classList.remove("show");
    });
}

function validateForm(name, price) {
    clearErrors();
    let isValid = true;
    if (!name.trim()) {
        document.getElementById("menu-name-error").textContent = "Please enter a dish name.";
        document.getElementById("menu-name-error").classList.add("show");
        isValid = false;
    }
    if (!price || price < 0 || isNaN(price)) {
        document.getElementById("menu-price-error").textContent = "Please enter a valid price.";
        document.getElementById("menu-price-error").classList.add("show");
        isValid = false;
    }
    return isValid;
}

function addOption(type, name, price) {
    const list = document.getElementById(`${type}-list`);
    const index = list.querySelectorAll(".option-item").length;
    list.insertAdjacentHTML("beforeend", `
        <div class="option-item" data-index="${index}">
            <p>${name} (GH₵${price.toFixed(2)})</p>
            <button type="button" class="btn btn-cancel delete-option-btn" data-type="${type}" data-index="${index}"><i class="fas fa-trash"></i></button>
        </div>
    `);
    hasUnsavedChanges = true;
    attachOptionDeleteListeners();
}

function deleteOption(btn) {
    const index = parseInt(btn.dataset.index);
    const type = btn.dataset.type;
    const list = document.getElementById(`${type}-list`);
    const item = list.querySelector(`.option-item[data-index="${index}"]`);
    if (!item) return;

    lastDeletedOption = {
        type,
        index,
        name: item.querySelector("p").textContent.split(" (")[0],
        price: parseFloat(item.querySelector("p").textContent.match(/GH₵([\d.]+)/)[1]),
    };
    item.remove();
    document.getElementById("undo-btn").classList.remove("hidden");
    hasUnsavedChanges = true;
}

function undoDelete() {
    if (!lastDeletedOption) return;
    addOption(lastDeletedOption.type, lastDeletedOption.name, lastDeletedOption.price);
    document.getElementById("undo-btn").classList.add("hidden");
    lastDeletedOption = null;
}

function attachOptionDeleteListeners() {
    document.querySelectorAll(".delete-option-btn").forEach(btn => {
        btn.removeEventListener("click", handleDeleteOption);
        btn.addEventListener("click", handleDeleteOption);
    });
}

function handleDeleteOption(e) {
    if (confirm("Delete this option?")) {
        deleteOption(e.target.closest("button"));
    }
}

function toggleOptionGroup(btn) {
    const list = document.getElementById(btn.getAttribute("aria-controls"));
    const isExpanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", !isExpanded);
    list.classList.toggle("hidden");
}

async function deleteMenuItem(menuId) {
    if (!confirm("Are you sure you want to delete this dish?")) return;
    try {
        await deleteDoc(doc(db, "restaurant", restaurantId, "menu", menuId));
        showNotification("Dish deleted successfully!", "success");
        loadMenu();
    } catch (error) {
        console.error("Error deleting dish:", error);
        showNotification("Failed to delete dish.", "error");
    }
}

async function markOrderAsBeingDelivered(orderId, buttonElement) {
  if (!buttonElement) return;

  const spinner = buttonElement.querySelector(".spinner");
  const textSpan = buttonElement.querySelector(".btn-text");

  // UI: Disable and show spinner
  buttonElement.disabled = true;
  if (spinner) spinner.classList.remove("hidden");
  if (textSpan) textSpan.textContent = "Processing...";

  try {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) throw new Error("Order not found");

    const order = orderSnap.data();
    const hostel = order.deliveryDetails?.hostel;
    if (!hostel) throw new Error("❌ Hostel not specified in order!");

    const deliveryEmail = await getNextDeliveryEmailForHostel(hostel);
    if (!deliveryEmail) throw new Error("❌ No delivery account assigned to this hostel.");

    const restaurantRef = doc(db, "restaurant", restaurantId);
    const restaurantSnap = await getDoc(restaurantRef);
    const restaurantName = restaurantSnap.exists() ? restaurantSnap.data().name || "Unknown" : "Unknown";

    await updateDoc(orderRef, {
      status: "being_delivered",
      restaurantId,
      restaurantName,
      beingDeliveredTimestamp: new Date().toISOString(),
      deliveryDetails: {
        ...order.deliveryDetails,
        deliveryEmail
      }
    });

const deliveryName = deliveryEmail.split("@")[0]
  .replace(/\./g, " ")
  .replace(/\b\w/g, c => c.toUpperCase());

showNotification(`✅ Assigned ${deliveryName} to deliver this order.`);
  } catch (error) {
    console.error("Error marking order as being delivered:", error);
    showNotification(error.message || "❌ Failed to update order status.", "error");
  } finally {
    // Revert button state
    buttonElement.disabled = false;
    if (spinner) spinner.classList.add("hidden");
    if (textSpan) textSpan.textContent = "Mark as Being Delivered";
  }
}


function manageProcessedOrders(orderId, action) {
    const key = `processedOrderIds_${restaurantId}`;
    let orderIds = JSON.parse(localStorage.getItem(key) || "[]");
    
    if (action === "add") {
        if (!orderIds.includes(orderId)) {
            orderIds.push(orderId);
            localStorage.setItem(key, JSON.stringify(orderIds));
        }
        return true;
    } else if (action === "check") {
        return orderIds.includes(orderId);
    } else if (action === "clear") {
        localStorage.removeItem(key);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

document.querySelectorAll("#add-category-btn, #add-category-btn-2").forEach(button => {
  button.addEventListener("click", async () => {
    const name = prompt("Enter new category name:");
    if (!name || !name.trim()) return showNotification("Category name cannot be empty.", "error");

    const sortOrderInput = prompt("Enter a sort order number (e.g., 1 for top):");
    const sortOrder = parseInt(sortOrderInput, 10);
    if (isNaN(sortOrder)) return showNotification("Invalid sort order number.", "error");

    try {
      const categoriesRef = collection(db, "restaurant", restaurantId, "categories");
      const existing = await getDocs(query(categoriesRef, where("name", "==", name.trim())));
      if (!existing.empty) {
        showNotification("This category already exists.", "warning");
        return;
      }

      await addDoc(categoriesRef, {
        name: name.trim(),
        sortOrder,
        createdAt: new Date()
      });

      showNotification("Category added successfully!");
      loadCategories();
      loadCategoriesView();
    } catch (error) {
      console.error("Error adding category:", error);
      showNotification("Failed to add category.", "error");
    }
  });
});


document.getElementById("add-dish-btn").addEventListener("click", openAddSection);
document.getElementById("cancel-dish-btn").addEventListener("click", closeSection);
document.getElementById("menu-edit-close-btn").addEventListener("click", closeSection);
document.getElementById("undo-btn").addEventListener("click", undoDelete);
document.getElementById("add-size-btn").addEventListener("click", () => {
    const name = prompt("Enter size name (e.g., Large):");
    if (!name) return;
    const price = prompt("Enter extra price for this size (e.g., 5.00):");
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        showNotification("Please enter a valid price.", "error");
        return;
    }
    addOption("size", name.trim(), parsedPrice);
});
document.getElementById("add-extra-btn").addEventListener("click", () => {
    const name = prompt("Enter extra name (e.g., Extra Cheese):");
    if (!name) return;
    const price = prompt("Enter price for this extra (e.g., 2.00):");
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        showNotification("Please enter a valid price.", "error");
        return;
    }
    addOption("extra", name.trim(), parsedPrice);
});
document.getElementById("menu-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("menu-name").value.trim();
    const price = parseFloat(document.getElementById("menu-price").value);
    const orderNumber = parseInt(document.getElementById("menu-order-number").value, 10);

    const form = document.getElementById("menu-form");
    const category = document.getElementById("menu-category").value.trim();

    const mode = form.dataset.mode;
    const sizeList = document.getElementById("size-list");
    const extraList = document.getElementById("extra-list");

    if (!validateForm(name, price)) return;

    const sizes = Array.from(sizeList.querySelectorAll(".option-item")).map(item => {
        const text = item.querySelector("p").textContent;
        return {
            name: text.split(" (")[0],
            price: parseFloat(text.match(/GH₵([\d.]+)/)[1]),
        };
    });
    const extras = Array.from(extraList.querySelectorAll(".option-item")).map(item => {
        const text = item.querySelector("p").textContent;
        return {
            name: text.split(" (")[0],
            price: parseFloat(text.match(/GH₵([\d.]+)/)[1]),
        };
    });

    try {
        if (mode === "add") {
  // Fetch category sortOrder
  let categoryOrder = 9999;
  try {
    const catRef = collection(db, "restaurant", restaurantId, "categories");
    const q = query(catRef, where("name", "==", category));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      categoryOrder = snapshot.docs[0].data().sortOrder ?? 9999;
    }
  } catch (err) {
    console.warn("Could not fetch category order:", err);
  }

  await addDoc(collection(db, "restaurant", restaurantId, "menu"), {
    name,
    price,
    sizes,
    extras,
    category,
    categoryOrder,
    orderNumber
  });
  showNotification("Dish added successfully!", "success");
}
 else if (mode === "edit") {
  let categoryOrder = 9999;
  try {
    const catRef = collection(db, "restaurant", restaurantId, "categories");
    const q = query(catRef, where("name", "==", category));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      categoryOrder = snapshot.docs[0].data().sortOrder ?? 9999;
    }
  } catch (err) {
    console.warn("Could not fetch category order:", err);
  }

  const menuId = form.dataset.id;
  await updateDoc(doc(db, "restaurant", restaurantId, "menu", menuId), {
    name,
    price,
    sizes,
    extras,
    category,
    categoryOrder,
    orderNumber
  });
  showNotification("Dish updated successfully!", "success");
}
       closeSection();
        loadMenu();
    } catch (error) {
        console.error(`Error ${mode === "add" ? "adding" : "updating"} dish:`, error);
        showNotification(`Failed to ${mode === "add" ? "add" : "update"} dish.`, "error");
    }
});
document.querySelectorAll(".toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleOptionGroup(btn));
});
document.getElementById("menu-form").addEventListener("input", () => {
    hasUnsavedChanges = true;
});


// Update the order count in the footer
function updateOrderCount(count) {
    const orderCountElement = document.getElementById("order-count");
    if (orderCountElement) {
        orderCountElement.textContent = count;
        orderCountElement.style.display = count > 0 ? "inline" : "none";
    }
}


function loadOrders() {
    if (orderListenerUnsubscribe) {
        orderListenerUnsubscribe();
        orderListenerUnsubscribe = null;
    }

    const q = query(collection(db, "orders"));
    const processedOrdersKey = `processedOrderIds_${restaurantId || 'all'}`;
    let processedOrders = JSON.parse(localStorage.getItem(processedOrdersKey) || "[]");

    const debouncedNotify = debounce((order, orderId, items, subtotal, timestamp, email) => {
        if (
            !processedOrders.includes(orderId) &&
            order.status !== "being_delivered" &&
            order.status !== "delivered" &&
            order.status !== "not_delivered"
        ) {
            sendNewOrderNotification({
                restaurantId: order.restaurantId,
                orderId: orderId,
                items: items,
                total: subtotal.toFixed(2),
                timestamp: timestamp,
                externalUserId: email
            });
        }
    }, 500);

    orderListenerUnsubscribe = onSnapshot(q, async (snapshot) => {
        const orders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(order => !["being_delivered", "delivered", "not_delivered", "ready-for-pickup", "cancelled"].includes(order.status))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        updateOrderCount(orders.length);

        const fragment = document.createDocumentFragment();
        for (const order of orders) {
            const itemsList = (order.cart || order.items || []);
            const mergedItemsMap = {};
            itemsList.forEach(item => {
                if (mergedItemsMap[item.name]) {
                    mergedItemsMap[item.name] += item.quantity;
                } else {
                    mergedItemsMap[item.name] = item.quantity;
                }
            });

            const detailedItems = itemsList.map(item => {
                const sizeHTML = item.size ? ` <span style="color:#ccc;">(Size: ${item.size})</span>` : "";
                const extrasHTML = item.extras?.length
                    ? ` <div style="color:#ccc; font-size:0.85rem;">Extras: ${item.extras.map(e => `${e.name} ×${e.quantity}`).join(", ")}</div>`
                    : "";
                return `<div style="margin-bottom: 6px;"><strong>${item.quantity}x ${item.name}</strong>${sizeHTML}${extrasHTML}</div>`;
            }).join("");

            const username = order.userName;
            const deliveryDetails = order.deliveryDetails || {};
            const subtotal = itemsList.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const orderTimeFormatted = (order.timestamp?.toDate ? order.timestamp.toDate() : new Date(order.timestamp)).toLocaleString();
            const restaurantName = order.restaurantName || "Unknown";

            const item = document.createElement("div");
            item.className = "orders-item";
            item.innerHTML = `
                <div class="order-summary cursor-pointer">
                    <p class="font-bold text-lg text-white">Restaurant: ${restaurantName}</p>
                    <p class="font-bold text-lg text-white">Items:</p>
                    ${detailedItems}
                    <p class="font-bold text-lg text-white">${deliveryDetails.hostel || "Not provided"}, Room ${deliveryDetails.location || "Not provided"}</p>
                    <p class="font-bold text-lg text-white">Note: ${deliveryDetails.note || "None"}</p>
                    <p class="font-bold text-lg text-white">Customer: ${username || "Unknown"}</p>
                    <p class="font-bold text-lg text-white">Contact: ${deliveryDetails.contactNumber || "None"}</p>
                    <p class="text-lg text-white">Time: ${orderTimeFormatted}</p>
                    <p class="text-lg text-white">Total: GH₵${subtotal.toFixed(2)}</p>
                    <div class="order-actions" data-order-id="${order.id}">
                        ${generateVendorButtons(order.status)}
                    </div>
                </div>
                <div class="order-details hidden mt-2">
                    <p class="font-bold text-lg text-white"><u><strong>Other info</strong></u></p>
                    <p><strong>Order ID:</strong> ${order.id}</p>
                    <p><strong>Contact:</strong> ${deliveryDetails.contactNumber || "Not provided"}</p>
                    <p><strong>Delivery by:</strong> ${deliveryDetails.deliveryEmail || "Unassigned"}</p>
                </div>
            `;

            item.querySelector(".order-summary").addEventListener("click", (e) => {
                if (!e.target.classList.contains("mark-delivered-btn")) {
                    const details = item.querySelector(".order-details");
                    details.classList.toggle("hidden");
                }
            });

            fragment.appendChild(item);
        }

        ordersList.innerHTML = "";
        ordersList.appendChild(fragment);

        ordersList.querySelectorAll(".btn-status-update").forEach(btn => {
            btn.addEventListener("click", handleVendorStatusUpdate);
        });
        ordersList.querySelectorAll(".btn-reject-order").forEach(btn => {
            btn.addEventListener("click", handleRejectOrder);
        });

        if (!orders.length) {
            ordersList.innerHTML = "<p class='text-gray-400'>No pending orders.</p>";
        }

        ordersList.querySelectorAll(".mark-delivered-btn").forEach(btn => {
            btn.removeEventListener("click", handleMarkDelivered);
            btn.addEventListener("click", handleMarkDelivered);
        });
    }, (error) => {
        console.error("Error loading orders:", error);
        ordersList.innerHTML = "<p class='text-gray-400'>Error loading orders.</p>";
        updateOrderCount(0);
    });
}

function handleMarkDelivered(e) {
    const button = e.currentTarget;
    const orderId = button.dataset.orderId;
    if (!orderId) return;

    markOrderAsBeingDelivered(orderId, button); // Pass button for spinner + disable
}

function generateVendorButtons(currentStatus) {
  if (currentStatus === "pending") {
    return `
      <div class="flex gap-3 mt-4">
        <button class="btn btn-status-update" data-next-status="accepted">
          <span class="spinner hidden"></span>
          <span class="btn-text">Accept Order</span>
        </button>
        <button class="btn btn-secondary btn-reject-order" style="font-size: 0.8rem; padding: 6px 10px;">
          Reject
        </button>
      </div>
    `;
  }

  if (currentStatus === "preparing") {
    return `
      <div class="flex gap-3 mt-4">
        <button class="btn btn-status-update" data-next-status="ready-for-pickup">
          <span class="spinner hidden"></span>
          <span class="btn-text">Ready for Pickup</span>
        </button>
      </div>
    `;
  }

  return ""; // No button for accepted or other states
}



async function handleVendorStatusUpdate(e) {
  const button = e.currentTarget;
  const nextStatus = button.dataset.nextStatus;
  const orderId = button.closest(".order-actions").dataset.orderId;

  const spinner = button.querySelector(".spinner");
  const textSpan = button.querySelector(".btn-text");

  button.disabled = true;
  if (spinner) spinner.classList.remove("hidden");
  if (textSpan) textSpan.textContent = "Updating...";

  try {
    const orderRef = doc(db, "orders", orderId);

    let updateData = {
      status: nextStatus,
      [`timestamps.${nextStatus}`]: new Date().toISOString()
    };

    // ✅ Inject assignment only when nextStatus is "ready-for-pickup"
  if (nextStatus === "ready-for-pickup") {
  const orderSnap = await getDoc(orderRef);
  const orderData = orderSnap.data();
  const hostel = orderData?.deliveryDetails?.hostel;

  try {
    const deliveryEmail = await getNextDeliveryEmailForHostel(hostel);

    if (!deliveryEmail) {
      throw new Error("No delivery personnel available.");
    }

    const deliveryName = deliveryEmail.split("@")[0];
    updateData.deliveryDetails = {
      ...orderData.deliveryDetails,
      deliveryEmail
    };

    showNotification(`✅ Assigned ${deliveryName} to this order.`);
  } catch (err) {
    console.error("Delivery assignment failed:", err);
    showNotification("❌ No delivery accounts available for this hostel.", "error");

    // Restore button state
    button.disabled = false;
    if (spinner) spinner.classList.add("hidden");
    if (textSpan) textSpan.textContent = textSpan.dataset.original || "Update";

    return; // ⛔ Don't proceed with status update
  }
}


    await updateDoc(orderRef, updateData);
    showNotification(`Order status updated to "${nextStatus}"`);

    // ⏱ Auto-transition to preparing if just accepted
    if (nextStatus === "accepted") {
      setTimeout(async () => {
        try {
          await updateDoc(orderRef, {
            status: "preparing",
            "timestamps.preparing": new Date().toISOString()
          });
          showNotification(`Order is now being prepared automatically.`);
        } catch (err) {
          console.error("Failed to auto-update to preparing:", err);
          showNotification("Auto-update to 'preparing' failed.", "error");
        }
      }, 1000);
    }

  } catch (error) {
    console.error("Status update failed:", error);
    showNotification("Failed to update order status.", "error");
  } finally {
    button.disabled = false;
    if (spinner) spinner.classList.add("hidden");
    if (textSpan) textSpan.textContent = textSpan.dataset.original || "Update";
  }
}



async function handleRejectOrder(e) {
  const button = e.currentTarget;
  const orderId = button.closest(".order-actions")?.dataset.orderId || 
                  button.closest(".orders-item")?.querySelector(".mark-delivered-btn")?.dataset.orderId;

  if (!orderId) {
    showNotification("Order ID not found", "error");
    return;
  }

  const confirmed = confirm("Are you sure you want to reject this order?");
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "orders", orderId), {
      status: "cancelled",
      "timestamps.cancelled": new Date().toISOString()
    });

    showNotification("Order has been rejected", "warning");
  } catch (err) {
    console.error("Failed to reject order:", err);
    showNotification("Failed to reject the order.", "error");
  }
}


async function loadDeliveredOrders() {
    const deliveredList = document.getElementById("delivered-list");
    if (!deliveredList) return;

    const q = query(collection(db, "orders"), where("status", "==", "delivered"));
    onSnapshot(q, async (snapshot) => {
        const orders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const timeA = a.deliveredTimestamp ? new Date(a.deliveredTimestamp) : new Date(a.timestamp);
                const timeB = b.deliveredTimestamp ? new Date(b.deliveredTimestamp) : new Date(b.timestamp);
                return timeB - timeA; // Sort newest to oldest
            });

        const fragment = document.createDocumentFragment();
        for (const order of orders) {
            const itemsList = order.cart || order.items || [];
            const mergedItemsMap = {};
            itemsList.forEach(item => {
                if (mergedItemsMap[item.name]) {
                    mergedItemsMap[item.name] += item.quantity;
                } else {
                    mergedItemsMap[item.name] = item.quantity;
                }
            });
            const detailedItems = itemsList.map(item => {
                const sizeHTML = item.size ? ` <span style="color:#ccc;">(Size: ${item.size})</span>` : "";
                const extrasHTML = item.extras?.length
                    ? ` <div style="color:#ccc; font-size:0.85rem;">Extras: ${item.extras.map(e => `${e.name} ×${e.quantity}`).join(", ")}</div>`
                    : "";
                return `<div style="margin-bottom: 6px;"><strong>${item.quantity}x ${item.name}</strong>${sizeHTML}${extrasHTML}</div>`;
            }).join("");

            const username = order.userName;
            const deliveryDetails = order.deliveryDetails || {};
            const subtotal = itemsList.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const orderTime = (order.deliveredTimestamp?.toDate ? order.deliveredTimestamp.toDate() : new Date(order.timestamp)).toLocaleString();
            const restaurantName = order.restaurantName || order.vendorEmail || "Unknown";

            const item = document.createElement("div");
            item.className = "orders-item bg-gray-800 p-4 rounded-lg shadow-md mb-4";
            item.innerHTML = `
                <div class="order-summary cursor-pointer">
                    <p class="font-bold text-lg text-white">Restaurant: ${restaurantName}</p>
                    <p class="font-bold text-lg text-white">Items:</p>
                    ${detailedItems}
                    <p class="font-bold text-lg text-white">${deliveryDetails.hostel || "Not provided"}, Room ${deliveryDetails.location || "Not provided"}</p>
                    <p class="font-bold text-lg text-white">Note: ${deliveryDetails.note || "None"}</p>
                    <p class="font-bold text-lg text-white">Customer: ${username || "Unknown"}</p>
                    <p class="font-bold text-lg text-white">Contact: ${deliveryDetails.contactNumber ? `<a href="tel:${deliveryDetails.contactNumber}" class="text-blue-400">${deliveryDetails.contactNumber}</a>` : "None"}</p>
                    <p class="text-lg text-white">Delivered: ${orderTime}</p>
                    <p class="text-lg text-white">Total: GH₵${subtotal.toFixed(2)}</p>
                    <p><strong>Status:</strong> <span class="text-green-400 font-bold">Delivered</span></p>
                </div>
                <div class="order-details hidden mt-2 text-gray-300">
                    <p class="font-bold text-lg text-white"><u><strong>Other Info</strong></u></p>
                    <p><strong>Order ID:</strong> ${order.id}</p>
                    <p><strong>Contact:</strong> ${deliveryDetails.contactNumber || "Not provided"}</p>
                    <p><strong>Delivery by:</strong> ${deliveryDetails.deliveryEmail || "Unassigned"}</p>
                </div>
            `;

            item.querySelector(".order-summary").addEventListener("click", () => {
                const details = item.querySelector(".order-details");
                details.classList.toggle("hidden");
            });

            fragment.appendChild(item);
        }

        deliveredList.innerHTML = "";
        deliveredList.appendChild(fragment);
        if (!orders.length) {
            deliveredList.innerHTML = "<p class='text-gray-400'>No delivered orders available.</p>";
        }
    }, (error) => {
        console.error("Error loading delivered orders:", error);
        deliveredList.innerHTML = "<p class='text-gray-400'>Error loading delivered orders.</p>";
    });
}

async function loadDeliveryOrders() {
    const deliveryList = document.getElementById("delivery-list");
    if (!deliveryList) return;

    const q = query(collection(db, "orders"), where("status", "in", ["ready-for-pickup", "being_delivered"]));
    onSnapshot(q, async (snapshot) => {
        const orders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const fragment = document.createDocumentFragment();
        for (const order of orders) {
            const itemsList = order.cart || order.items || [];
            const mergedItemsMap = {};
            itemsList.forEach(item => {
                if (mergedItemsMap[item.name]) {
                    mergedItemsMap[item.name] += item.quantity;
                } else {
                    mergedItemsMap[item.name] = item.quantity;
                }
            });
            const detailedItems = itemsList.map(item => {
                const sizeHTML = item.size ? ` <span style="color:#ccc;">(Size: ${item.size})</span>` : "";
                const extrasHTML = item.extras?.length
                    ? ` <div style="color:#ccc; font-size:0.85rem;">Extras: ${item.extras.map(e => `${e.name} ×${e.quantity}`).join(", ")}</div>`
                    : "";
                return `<div style="margin-bottom: 6px;"><strong>${item.quantity}x ${item.name}</strong>${sizeHTML}${extrasHTML}</div>`;
            }).join("");

            const username = order.userName;
            const deliveryDetails = order.deliveryDetails || {};
            const subtotal = itemsList.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const orderTime = (order.timestamp?.toDate ? order.timestamp.toDate() : new Date(order.timestamp)).toLocaleString();
            const restaurantName = order.restaurantName || order.vendorEmail || "Unknown";
            const statusText = order.status === "ready-for-pickup" ? "Ready for Pickup" : "In Transit";
            const statusClass = order.status === "ready-for-pickup" ? "text-yellow-400" : "text-blue-400";

            const item = document.createElement("div");
            item.className = "orders-item bg-gray-800 p-4 rounded-lg shadow-md mb-4";
            item.innerHTML = `
                <div class="order-summary cursor-pointer">
                    <p class="font-bold text-lg text-white">Restaurant: ${restaurantName}</p>
                    <p class="font-bold text-lg text-white">Items:</p>
                    ${detailedItems}
                    <p class="font-bold text-lg text-white">${deliveryDetails.hostel || "Not provided"}, Room ${deliveryDetails.location || "Not provided"}</p>
                    <p class="font-bold text-lg text-white">Note: ${deliveryDetails.note || "None"}</p>
                    <p class="font-bold text-lg text-white">Customer: ${username || "Unknown"}</p>
                    <p class="font-bold text-lg text-white">Contact: ${deliveryDetails.contactNumber ? `<a href="tel:${deliveryDetails.contactNumber}" class="text-blue-400">${deliveryDetails.contactNumber}</a>` : "None"}</p>
                    <p class="text-lg text-white">Time: ${orderTime}</p>
                    <p class="text-lg text-white">Total: GH₵${subtotal.toFixed(2)}</p>
                    <p><strong>Status:</strong> <span class="${statusClass} font-bold">${statusText}</span></p>
                    <div class="order-actions flex gap-3 mt-4" data-order-id="${order.id}">
                        ${order.status === "ready-for-pickup" ? `
                            <button class="btn btn-edit begin-delivery-btn bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded" data-order-id="${order.id}">
                                <span class="spinner hidden inline-block w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></span>
                                <span class="btn-text">Begin Delivery</span>
                            </button>
                        ` : ""}
                        ${order.status === "being_delivered" ? `
                            <button class="btn btn-secondary delivered-btn bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded" data-order-id="${order.id}">
                                <span class="btn-text">Delivered</span>
                            </button>
                        ` : ""}
                    </div>
                </div>
                <div class="order-details hidden mt-2 text-gray-300">
                    <p class="font-bold text-lg text-white"><u><strong>Other Info</strong></u></p>
                    <p><strong>Order ID:</strong> ${order.id}</p>
                    <p><strong>Contact:</strong> ${deliveryDetails.contactNumber || "Not provided"}</p>
                    <p><strong>Delivery by:</strong> ${deliveryDetails.deliveryEmail || "Unassigned"}</p>
                </div>
            `;

            item.querySelector(".order-summary").addEventListener("click", (e) => {
                if (!e.target.classList.contains("begin-delivery-btn") && !e.target.classList.contains("delivered-btn")) {
                    const details = item.querySelector(".order-details");
                    details.classList.toggle("hidden");
                }
            });

            fragment.appendChild(item);
        }

        deliveryList.innerHTML = "";
        deliveryList.appendChild(fragment);
        if (!orders.length) {
            deliveryList.innerHTML = "<p class='text-gray-400'>No delivery orders available.</p>";
        }

        deliveryList.querySelectorAll(".begin-delivery-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const orderId = e.currentTarget.dataset.orderId;
                const button = e.currentTarget;
                const spinner = button.querySelector(".spinner");
                const textSpan = button.querySelector(".btn-text");

                button.disabled = true;
                if (spinner) spinner.classList.remove("hidden");
                if (textSpan) textSpan.textContent = "Processing...";

                try {
                    const orderRef = doc(db, "orders", orderId);
                    const orderSnap = await getDoc(orderRef);
                    if (!orderSnap.exists()) throw new Error("Order not found");

                    const order = orderSnap.data();
                    if (order.status !== "ready-for-pickup") throw new Error("Order not ready for pickup");

                    await updateDoc(orderRef, {
                        status: "being_delivered",
                        beingDeliveredTimestamp: new Date().toISOString()
                    });

                    showNotification("✅ Delivery started.", "success");
                } catch (error) {
                    console.error("Error starting delivery:", error);
                    showNotification(error.message || "❌ Failed to start delivery.", "error");
                } finally {
                    button.disabled = false;
                    if (spinner) spinner.classList.add("hidden");
                    if (textSpan) textSpan.textContent = "Begin Delivery";
                }
            });
        });

        deliveryList.querySelectorAll(".delivered-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const orderId = e.currentTarget.dataset.orderId;
                const button = e.currentTarget;
                const textSpan = button.querySelector(".btn-text");

                button.disabled = true;
                if (textSpan) textSpan.textContent = "Processing...";

                try {
                    const orderRef = doc(db, "orders", orderId);
                    const orderSnap = await getDoc(orderRef);
                    if (!orderSnap.exists()) throw new Error("Order not found");

                    const order = orderSnap.data();
                    if (order.status !== "being_delivered") throw new Error("Order not in transit");

                    const userEmail = auth.currentUser?.email || "anonymous@chawp.com";
                    await updateDoc(orderRef, {
                        status: "delivered",
                        deliveryPersonId: userEmail,
                        deliveredTimestamp: new Date().toISOString()
                    });
                    showNotification("Great job! Order marked as delivered", "success");
                } catch (error) {
                    console.error("Error marking as delivered:", error);
                    showNotification(error.message || "❌ Couldn't mark as delivered.", "error");
                } finally {
                    button.disabled = false;
                    if (textSpan) textSpan.textContent = "Delivered";
                }
            });
        });
    }, (error) => {
        console.error("Error loading delivery orders:", error);
        deliveryList.innerHTML = "<p class='text-gray-400'>Error loading delivery orders.</p>";
    });
}


onAuthStateChanged(auth, async (user) => {
    if (user && user.email) {
        const mappingRef = doc(db, "vendorMappings", user.email);
        const mappingSnap = await getDoc(mappingRef);

        if (mappingSnap.exists()) {
            restaurantId = mappingSnap.data().restaurantId;

            OneSignal.push(() => safeTagUser(user.email));
            OneSignal.push(() => validateOneSignalTags(user.email));

            await ensureVisibilityFields();
            loadCategoriesView();

            loadingScreen.style.display = "none";
            loginSection.style.display = "none";
            mainContent.classList.remove("hidden");

            await Promise.all([
                loadRestaurantData(),
                loadMenu(),
                loadOrders(),
                loadDeliveredOrders(),
                loadDashboard(),
                listenForNewOrders(),
                loadDeliveryOrders()
            ]);
        } else {
            loadingScreen.style.display = "none";
            loginSection.style.display = "none";
            mainContent.classList.remove("hidden");

            await loadDeliveryOrders();
            toggleSection("delivery");
        }
    } else {
        loginSection.style.display = "none"; // Hide login for unauthenticated users
        mainContent.classList.remove("hidden");
        loadingScreen.style.display = "none";
        restaurantId = null;

        OneSignal.push(() => {
            OneSignal.removeExternalUserId();
            console.log("🔓 OneSignal external ID removed");
        });

        await loadDeliveryOrders();
        toggleSection("delivery");
    }
});



document.getElementById("store-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("store-name").value;
    await setDoc(doc(db, "restaurant", restaurantId), { name, image }, { merge: true });
    showNotification("Store updated successfully!");
    loadRestaurantData();
});

document.getElementById("open-shop-btn").addEventListener("click", async () => {
    await setDoc(doc(db, "restaurant", restaurantId), { isOpen: true }, { merge: true });
    showNotification("Shop opened!");
    loadRestaurantData();
});

document.getElementById("close-shop-btn").addEventListener("click", async () => {
    await setDoc(doc(db, "restaurant", restaurantId), { isOpen: false }, { merge: true });
    showNotification("Shop closed!");
    loadRestaurantData();
});

// Initialize OneSignal
function initializeOneSignal() {
    window.OneSignal = window.OneSignal || [];
    
    // Check if we're already subscribed
    OneSignal.push(async function() {
        const isPushSupported = OneSignal.isPushNotificationsSupported();
        if (isPushSupported) {
            // Get subscription state
            const pushSubscription = await OneSignal.getSubscription();
            if (!pushSubscription) {
                // If not subscribed, show a prompt to the user
                showNotification("Enable notifications to get alerts for new deliveries", "warning", "bell");
                
                // Automatically prompt for notification permission
                setTimeout(() => {
                    OneSignal.showSlidedownPrompt();
                }, 3000);
            } else {
                console.log("User is already subscribed to push notifications");
                showNotification("Notifications are enabled for new deliveries", "success", "bell");
            }
        } else {
            console.log("Push notifications are not supported");
            showNotification("Your browser doesn't support push notifications", "warning", "bell-slash");
        }
    });
    
    // Example: set external ID to user email when signed in

auth.onAuthStateChanged((user) => {
  if (user && user.email) {
    console.log("Authenticated user email:", user.email);

    OneSignal.push(function() {
      OneSignal.setExternalUserId(user.email)
        .then(() => {
          console.log("Successfully set external user ID:", user.email);
        })
        .catch((err) => {
          console.error("Failed to set external user ID:", err);
        });
    });

  } else {
    console.log("No authenticated user or email found");
  }
});

}



// 🧠 Firebase Auth listener
onAuthStateChanged(auth, async (user) => {
  if (user && user.email) {
    const mappingRef = doc(db, "vendorMappings", user.email);
    const mappingSnap = await getDoc(mappingRef);

    if (mappingSnap.exists()) {
      restaurantId = mappingSnap.data().restaurantId;

      OneSignal.push(() => safeTagUser(user.email));
      OneSignal.push(() => validateOneSignalTags(user.email));

      await ensureVisibilityFields();
      loadCategoriesView();

      loadingScreen.style.display = "none";
      loginSection.style.display = "none";
      mainContent.classList.remove("hidden");

      await Promise.all([
        loadRestaurantData(),
        loadMenu(),
        loadOrders(),
        loadDeliveredOrders(),
        loadDashboard(),
        listenForNewOrders(),
      ]);
    } else {
      await signOut(auth);
      loginSection.style.display = "flex";
      mainContent.classList.add("hidden");
      loadingScreen.style.display = "none";
      showLoginNotification("No restaurant assigned to this email!", "error");
    }
  } else {
    loginSection.style.display = "flex";
    mainContent.classList.add("hidden");
    loadingScreen.style.display = "none";
    restaurantId = null;

    OneSignal.push(() => {
      OneSignal.removeExternalUserId();
      console.log("🔓 OneSignal external ID removed");
    });

    setTimeout(() => {
      if (document.getElementById("login-notification")) {
        showLoginNotification("Please enter your login details", "info");
      }
    }, 1000);
  }
});

let notifiedOrders = new Set();

function listenForNewOrders() {
    if (!restaurantId) return;

    const q = query(
        collection(db, "orders"),
        where("restaurantId", "==", restaurantId),
        orderBy("timestamp", "desc")
    );

    const notified = new Set();

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const orderData = change.doc.data();
                const orderId = change.doc.id;

                if (notified.has(orderId)) return;
                notified.add(orderId);

            }
        });
    });
}

listenForNewOrders();

document.getElementById("login-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const loginButton = document.getElementById("login-btn");
    const spinner = document.getElementById("login-spinner");
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    emailInput.classList.remove("error");
    passwordInput.classList.remove("error");
    let isValid = true;
    if (!email) {
        showLoginNotification("Email address is required", "error");
        emailInput.classList.add("error");
        isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showLoginNotification("Invalid email format", "error");
        emailInput.classList.add("error");
        isValid = false;
    }
    if (!password) {
        showLoginNotification("Password is required", "error");
        passwordInput.classList.add("error");
        isValid = false;
    } else if (password.length < 6) {
        showLoginNotification("Password must be at least 6 characters", "warning");
        passwordInput.classList.add("error");
        isValid = false;
    }
    if (!isValid) return;
    loginButton.disabled = true;
    spinner.style.display = "block";
    loginButton.querySelector("span").textContent = "Signing in...";
    showLoginNotification("Logging in...", "info");
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        let errorMessage = "Wrong email or password. Please try again.";
        switch (error.code) {
            case "auth/user-not-found":
                errorMessage = "No account found with this email address.";
                emailInput.classList.add("error");
                break;
            case "auth/wrong-password":
                errorMessage = "Incorrect password. Please try again.";
                passwordInput.classList.add("error");
                passwordInput.value = "";
                passwordInput.focus();
                break;
            case "auth/too-many-requests":
                errorMessage = "Too many failed attempts. Please try again later.";
                break;
            case "auth/network-request-failed":
                errorMessage = "Network error. Please check your connection.";
                break;
        }
        showLoginNotification(errorMessage, "error");
        loginButton.disabled = false;
        spinner.style.display = "none";
        loginButton.querySelector("span").textContent = "Sign In";
    }
});

function showLoginNotification(message, type = "info") {
    const notification = document.getElementById("login-notification");
    if (!notification) return;
    if (window.loginNotificationTimer) {
        clearTimeout(window.loginNotificationTimer);
    }
    const icon = type === "error" ? "fa-circle-exclamation" : 
                type === "warning" ? "fa-triangle-exclamation" : 
                type === "info" ? "fa-circle-info" : "fa-circle-check";
    notification.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    notification.className = `notification ${type}`;
    void notification.offsetWidth;
    notification.classList.add("show");
    if (type === "error" || type === "warning") {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
            audio.play().catch(() => {});
        } catch (e) {}
    }
    if (type === "error" && navigator.vibrate) {
        navigator.vibrate(200);
    }
    window.loginNotificationTimer = setTimeout(() => {
        notification.classList.remove("show");
    }, 4000);
}

document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
        await signOut(auth);
        showNotification("Logged out successfully!", "success");
    } catch (error) {
        console.error("Error signing out:", error);
        showNotification("Failed to log out.", "error");
    }
});

document.getElementById("refresh-app-btn").addEventListener("click", () => {
    manageProcessedOrders(null, "clear");
    location.reload();
});

document.getElementById("delivery-btn").addEventListener("click", async () => {
    toggleSection("delivery");
    loadDeliveryOrders();
});
document.getElementById("refresh-delivery-btn").addEventListener("click", () => {
    loadDeliveryOrders();
    showNotification("Delivery orders refreshed", "success");
});
document.getElementById("view-orders-btn").addEventListener("click", () => toggleSection("view-orders"));
document.getElementById("delivered-btn").addEventListener("click", () => toggleSection("delivered"));
document.getElementById("settings-btn").addEventListener("click", () => toggleSection("settings"));
// CATEGORY MODAL BEHAVIOR
document.getElementById("view-categories-btn").addEventListener("click", () => {
  document.getElementById("categories-section").classList.add("show");
  document.getElementById("categories-section").classList.remove("hidden");
  loadCategoriesView();
});
document.getElementById("close-categories-btn").addEventListener("click", () => {
  const section = document.getElementById("categories-section");
  section.classList.remove("show");
  setTimeout(() => section.classList.add("hidden"), 300);
});

document.getElementById("toggle-password").addEventListener("click", () => {
    const passwordInput = document.getElementById("password");
    const toggleBtn = document.getElementById("toggle-password");
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    toggleBtn.innerHTML = `<i class="fas ${isPassword ? "fa-eye-slash" : "fa-eye"}"></i>`;
});

// Expose functions to the global scope
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;

    // 🔄 Re-tag on every hard reload (even if already logged in)
window.addEventListener("load", () => {
  if (auth.currentUser && auth.currentUser.email) {
    OneSignal.push(() => safeTagUser(auth.currentUser.email));
    OneSignal.push(() => validateOneSignalTags(auth.currentUser.email));
  }
});
    